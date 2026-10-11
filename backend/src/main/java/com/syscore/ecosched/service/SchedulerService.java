package com.syscore.ecosched.service;

import com.syscore.ecosched.dto.PickupRequestResponse;
import com.syscore.ecosched.dto.SchedulerQueueItem;
import com.syscore.ecosched.dto.SchedulerRunResponse;
import com.syscore.ecosched.dto.SchedulerStatusResponse;
import com.syscore.ecosched.entity.CollectionTeam;
import com.syscore.ecosched.entity.PickupRequest;
import com.syscore.ecosched.entity.RequestStatus;
import com.syscore.ecosched.entity.TeamStatus;
import com.syscore.ecosched.exception.ConflictException;
import com.syscore.ecosched.exception.ResourceNotFoundException;
import com.syscore.ecosched.exception.SchedulerUnavailableException;
import com.syscore.ecosched.repository.CollectionTeamRepository;
import com.syscore.ecosched.repository.PickupRequestRepository;
import com.syscore.ecosched.scheduler.SchedulerBridge;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Connects MySQL and the C scheduler:
 *   read teams + open requests from the DB (rows locked) -> send them to the C program ->
 *   read its decision -> write the new request/team state back, all in ONE transaction.
 * The C program makes the scheduling decision; Java only moves data and applies the result.
 */
@Service
public class SchedulerService {

    /** Requests the scheduler needs to see: waiting ones plus the ones that occupy a team. */
    private static final List<RequestStatus> OPEN =
            List.of(RequestStatus.PENDING, RequestStatus.ASSIGNED, RequestStatus.IN_PROGRESS);
    private static final List<RequestStatus> ACTIVE =
            List.of(RequestStatus.ASSIGNED, RequestStatus.IN_PROGRESS);

    private final PickupRequestRepository requestRepository;
    private final CollectionTeamRepository teamRepository;
    private final SchedulerBridge bridge;

    /** Result of the most recent committed scheduler run, so the dashboard can show it after a page reload. */
    private final AtomicReference<SchedulerRunResponse> lastRun = new AtomicReference<>();

    public SchedulerService(PickupRequestRepository requestRepository,
                            CollectionTeamRepository teamRepository,
                            SchedulerBridge bridge) {
        this.requestRepository = requestRepository;
        this.teamRepository = teamRepository;
        this.bridge = bridge;
    }

    /** POST /api/scheduler/run : one non-preemptive scheduling round on the real database state. */
    @Transactional
    public SchedulerRunResponse run() {
        // Lock order is always teams, then requests (also in completeRequest) so transactions cannot deadlock.
        List<CollectionTeam> teams = teamRepository.findAllForUpdate();
        List<PickupRequest> open = requestRepository.findByStatusIn(OPEN);
        Map<Long, CollectionTeam> teamById = new HashMap<>();
        teams.forEach(t -> teamById.put(t.getTeamId(), t));
        Map<Long, PickupRequest> requestById = new HashMap<>();
        open.forEach(r -> requestById.put(r.getRequestId(), r));

        int pendingBefore = (int) open.stream().filter(r -> r.getStatus() == RequestStatus.PENDING).count();
        List<String> out = bridge.execute("run", null, buildInput(teams, open));

        List<SchedulerRunResponse.Assignment> assignments = new ArrayList<>();
        int pending = -1;
        int available = -1;
        int busy = -1;
        for (String line : out) {
            String[] f = line.split("\\s+");
            if (f[0].equals("ASSIGN") && f.length == 5) {
                PickupRequest r = requestById.get(Long.parseLong(f[1]));
                CollectionTeam t = teamById.get(Long.parseLong(f[2]));
                if (r == null || t == null) {
                    throw new SchedulerUnavailableException("C scheduler returned an unknown request/team: " + line);
                }
                // Defence in depth: the rows are locked, so these must hold. If not, abort and roll back.
                if (r.getStatus() != RequestStatus.PENDING || t.getStatus() != TeamStatus.AVAILABLE) {
                    throw new ConflictException("Scheduler result no longer matches the database; nothing was changed. Run it again.");
                }
                // The four changes of one assignment. They are flushed in this order (request first, then team)
                // because the database checks them one statement at a time: the team's composite foreign key
                // needs the request to already carry this team_id. All of it commits - or rolls back - together.
                r.setTeam(t);                              // 1. pickup_requests.team_id
                r.setStatus(RequestStatus.ASSIGNED);       // 2. pickup_requests.status
                requestRepository.saveAndFlush(r);
                t.setStatus(TeamStatus.BUSY);              // 3. collection_teams.status
                t.setCurrentTask(r.getRequestId());        // 4. collection_teams.current_task
                teamRepository.saveAndFlush(t);
                assignments.add(new SchedulerRunResponse.Assignment(
                        r.getRequestId(), t.getTeamId(), t.getTeamName(), r.getPriority(), r.getRequestTime(), r.getLocation(),
                        r.getStatus().name(), t.getStatus().name(), t.getCurrentTask()));
            } else if (f[0].equals("SUMMARY")) {
                for (String kv : f) {
                    if (kv.startsWith("pending=")) pending = Integer.parseInt(kv.substring(8));
                    else if (kv.startsWith("available_teams=")) available = Integer.parseInt(kv.substring(16));
                    else if (kv.startsWith("busy_teams=")) busy = Integer.parseInt(kv.substring(11));
                }
            }
        }
        if (pending < 0 || available < 0 || busy < 0) {
            throw new SchedulerUnavailableException("C scheduler output had no SUMMARY line");
        }

        String message;
        if (!assignments.isEmpty()) {
            message = assignments.size() + " request(s) assigned";
        } else if (pending == 0) {
            message = "No pending requests to schedule";
        } else if (available == 0) {
            message = "All teams are busy; " + pending + " request(s) stay PENDING (non-preemptive: running work is not interrupted)";
        } else {
            message = "Nothing to assign";
        }
        SchedulerRunResponse response = new SchedulerRunResponse(pendingBefore, assignments.size(), pending, available, busy, assignments, message);
        rememberAfterCommit(response);
        return response;
    }

    /** Keep the run result for GET /status, but only if the transaction really committed. */
    private void rememberAfterCommit(SchedulerRunResponse response) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    lastRun.set(response);
                }
            });
        } else {
            lastRun.set(response);
        }
    }

    /** GET /api/scheduler/queue : pending requests in the order the C scheduler will dispatch them. */
    @Transactional(readOnly = true)
    public List<SchedulerQueueItem> getQueue() {
        List<PickupRequest> pending = requestRepository.findByStatusOrderByRequestTimeAsc(RequestStatus.PENDING);
        Map<Long, PickupRequest> byId = new LinkedHashMap<>();
        pending.forEach(r -> byId.put(r.getRequestId(), r));

        List<String> out = bridge.execute("queue", null, buildInput(List.of(), pending));
        List<SchedulerQueueItem> queue = new ArrayList<>();
        for (String line : out) {
            String[] f = line.split("\\s+");
            if (f[0].equals("QUEUE") && f.length == 5) {
                PickupRequest r = byId.get(Long.parseLong(f[2]));
                if (r != null) {
                    queue.add(new SchedulerQueueItem(Integer.parseInt(f[1]), r.getRequestId(),
                            r.getPriority(), r.getRequestTime(), r.getLocation()));
                }
            }
        }
        return queue;
    }

    /** GET /api/scheduler/status : counts and what each team is doing, straight from the database. */
    @Transactional(readOnly = true)
    public SchedulerStatusResponse getStatus() {
        Map<Long, PickupRequest> activeByTeam = new HashMap<>();
        for (PickupRequest r : requestRepository.findByStatusInOrderByRequestIdAsc(ACTIVE)) {
            if (r.getTeam() != null) activeByTeam.put(r.getTeam().getTeamId(), r);
        }
        List<SchedulerStatusResponse.TeamInfo> teams = new ArrayList<>();
        for (CollectionTeam t : teamRepository.findAll()) {
            PickupRequest active = activeByTeam.get(t.getTeamId());
            teams.add(new SchedulerStatusResponse.TeamInfo(
                    t.getTeamId(), t.getTeamName(), t.getStatus().name(),
                    active == null ? null : active.getRequestId(),
                    t.getContactPhone(), t.getVehicleNumber(), t.getCurrentTask(),
                    active == null ? null : active.getPriority()));
        }
        return new SchedulerStatusResponse(
                bridge.isAvailable(),
                requestRepository.countByStatus(RequestStatus.PENDING),
                requestRepository.countByStatus(RequestStatus.ASSIGNED),
                requestRepository.countByStatus(RequestStatus.IN_PROGRESS),
                requestRepository.countByStatus(RequestStatus.COMPLETED),
                teamRepository.countByStatus(TeamStatus.AVAILABLE),
                teamRepository.countByStatus(TeamStatus.BUSY),
                teams,
                requestRepository.countIntegrityViolations(),
                lastRun.get());
    }

    /** PUT /api/requests/{id}/complete : request -> COMPLETED, its team -> AVAILABLE (decided by the C program). */
    @Transactional
    public PickupRequestResponse completeRequest(Long id) {
        PickupRequest existing = requestRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Pickup request not found with id " + id));

        List<CollectionTeam> teams = teamRepository.findAllForUpdate();
        List<PickupRequest> open = requestRepository.findByStatusIn(OPEN);
        PickupRequest request = null;
        for (PickupRequest r : open) {
            if (r.getRequestId().equals(id)) request = r;
        }
        if (request == null) {
            // Not open any more (COMPLETED / CANCELLED) - report its real status.
            throw new ConflictException("Request " + id + " cannot be completed: it is " + existing.getStatus());
        }
        if (request.getStatus() == RequestStatus.PENDING) {
            throw new ConflictException("Request " + id + " cannot be completed: it is PENDING (no team assigned yet)");
        }

        List<String> out = bridge.execute("complete", String.valueOf(id), buildInput(teams, open));
        Long teamId = null;
        for (String line : out) {
            String[] f = line.split("\\s+");
            if (f[0].equals("COMPLETED") && f.length == 3 && Long.parseLong(f[1]) == id) teamId = Long.parseLong(f[2]);
        }
        if (teamId == null) throw new SchedulerUnavailableException("C scheduler output had no COMPLETED line");

        CollectionTeam team = null;
        for (CollectionTeam t : teams) {
            if (t.getTeamId().equals(teamId)) team = t;
        }
        if (team == null) throw new SchedulerUnavailableException("C scheduler named an unknown team " + teamId);

        // Release the team FIRST, then close the request (the database refuses the opposite order:
        // trigger trg_requests_release_check). Both statements commit together.
        team.setStatus(TeamStatus.AVAILABLE);
        team.setCurrentTask(null);
        teamRepository.saveAndFlush(team);
        request.setStatus(RequestStatus.COMPLETED);   // request keeps its team_id as history
        requestRepository.saveAndFlush(request);
        return PickupRequestResponse.from(request);
    }

    /** PUT /api/requests/{id}/start : ASSIGNED -> IN_PROGRESS. The team stays BUSY on the same request. */
    @Transactional
    public PickupRequestResponse startRequest(Long id) {
        PickupRequest request = lockOpenRequest(id, "started").request;
        if (request.getStatus() != RequestStatus.ASSIGNED) {
            throw new ConflictException("Request " + id + " cannot be started: it is " + request.getStatus()
                    + " (only an ASSIGNED request can start)");
        }
        request.setStatus(RequestStatus.IN_PROGRESS);
        requestRepository.saveAndFlush(request);
        return PickupRequestResponse.from(request);
    }

    /**
     * PUT /api/requests/{id}/cancel : PENDING / ASSIGNED / IN_PROGRESS -> CANCELLED.
     * If a team was working on it, the team is released in the same transaction.
     */
    @Transactional
    public PickupRequestResponse cancelRequest(Long id) {
        Locked locked = lockOpenRequest(id, "cancelled");
        PickupRequest request = locked.request;
        if (request.getStatus() != RequestStatus.PENDING) {
            CollectionTeam team = null;
            for (CollectionTeam t : locked.teams) {
                if (id.equals(t.getCurrentTask())) team = t;
            }
            if (team == null) {
                throw new ConflictException("Request " + id + " is " + request.getStatus()
                        + " but no team lists it as its current task; run database/scheduler_checks.sql");
            }
            team.setStatus(TeamStatus.AVAILABLE);
            team.setCurrentTask(null);
            teamRepository.saveAndFlush(team);        // release the team first
        }
        request.setStatus(RequestStatus.CANCELLED);   // keeps team_id (if any) as history
        requestRepository.saveAndFlush(request);
        return PickupRequestResponse.from(request);
    }

    private record Locked(PickupRequest request, List<CollectionTeam> teams) { }

    /** Locks all teams, then all open requests (same order as run()) and returns the open request with this id. */
    private Locked lockOpenRequest(Long id, String verb) {
        PickupRequest existing = requestRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Pickup request not found with id " + id));
        List<CollectionTeam> teams = teamRepository.findAllForUpdate();
        for (PickupRequest r : requestRepository.findByStatusIn(OPEN)) {
            if (r.getRequestId().equals(id)) return new Locked(r, teams);
        }
        throw new ConflictException("Request " + id + " cannot be " + verb + ": it is " + existing.getStatus());
    }

    /** Text protocol understood by scheduler_cli.c (see scheduler/README.md). */
    private String buildInput(List<CollectionTeam> teams, List<PickupRequest> requests) {
        StringBuilder sb = new StringBuilder();
        for (CollectionTeam t : teams) {
            sb.append("TEAM ").append(t.getTeamId()).append(' ').append(t.getStatus().name()).append('\n');
        }
        for (PickupRequest r : requests) {
            sb.append("REQUEST ").append(r.getRequestId()).append(' ')
              .append(r.getPriority()).append(' ')
              .append(r.getRequestTime().toEpochSecond(ZoneOffset.UTC)).append(' ')
              .append(r.getStatus().name()).append(' ')
              .append(r.getTeam() == null ? "-" : r.getTeam().getTeamId().toString()).append('\n');
        }
        return sb.toString();
    }
}
