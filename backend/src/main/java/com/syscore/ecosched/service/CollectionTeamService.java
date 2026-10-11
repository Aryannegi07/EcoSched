package com.syscore.ecosched.service;

import com.syscore.ecosched.dto.CollectionTeamRequest;
import com.syscore.ecosched.dto.CollectionTeamUpdateRequest;
import com.syscore.ecosched.entity.CollectionTeam;
import com.syscore.ecosched.entity.TeamStatus;
import com.syscore.ecosched.exception.BadRequestException;
import com.syscore.ecosched.exception.ConflictException;
import com.syscore.ecosched.exception.ResourceNotFoundException;
import com.syscore.ecosched.repository.CollectionTeamRepository;
import com.syscore.ecosched.repository.PickupRequestRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@Transactional(readOnly = true)
public class CollectionTeamService {

    private final CollectionTeamRepository teamRepository;

    private final PickupRequestRepository requestRepository;

    public CollectionTeamService(CollectionTeamRepository teamRepository, PickupRequestRepository requestRepository) {
        this.teamRepository = teamRepository;
        this.requestRepository = requestRepository;
    }

    @Transactional
    public CollectionTeam createTeam(CollectionTeamRequest request) {
        String name = request.getTeamName().trim();

        if (teamRepository.existsByTeamName(name)) {
            throw new ConflictException("A team named '" + name + "' already exists");
        }

        CollectionTeam team = new CollectionTeam();
        team.setTeamName(name);
        team.setContactPhone(request.getContactPhone().trim());
        team.setVehicleNumber(request.getVehicleNumber());
        // A BUSY team must be working on a request (database CHECK chk_teams_busy_task), and only the
        // scheduler can give it one. So a new team always starts AVAILABLE.
        if (request.getStatus() == TeamStatus.BUSY) {
            throw new BadRequestException("A new team cannot be BUSY: the scheduler marks a team BUSY when it assigns a request");
        }
        team.setStatus(TeamStatus.AVAILABLE);
        return teamRepository.save(team);
    }

    /** PUT /api/teams/{id} : change name / phone / vehicle (never the status). */
    @Transactional
    public CollectionTeam updateTeam(Long id, CollectionTeamUpdateRequest request) {
        CollectionTeam team = teamRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Team not found with id " + id));
        String name = request.getTeamName().trim();
        if (!name.equals(team.getTeamName()) && teamRepository.existsByTeamName(name)) {
            throw new ConflictException("A team named '" + name + "' already exists");
        }
        team.setTeamName(name);
        team.setContactPhone(request.getContactPhone().trim());
        String vehicle = request.getVehicleNumber() == null ? null : request.getVehicleNumber().trim();
        team.setVehicleNumber(vehicle == null || vehicle.isEmpty() ? null : vehicle);
        return teamRepository.save(team);
    }

    /** DELETE /api/teams/{id} : only a team that is idle and has no request history (foreign key RESTRICT). */
    @Transactional
    public void deleteTeam(Long id) {
        CollectionTeam team = teamRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Team not found with id " + id));
        if (team.getStatus() == TeamStatus.BUSY) {
            throw new ConflictException("Team " + id + " is BUSY and cannot be deleted");
        }
        if (requestRepository.existsByTeam_TeamId(id)) {
            throw new ConflictException("Team " + id + " has pickup requests in its history and cannot be deleted");
        }
        teamRepository.delete(team);
    }

    public List<CollectionTeam> getAllTeams() {
        return teamRepository.findAll();
    }

    public List<CollectionTeam> getAvailableTeams() {
        return teamRepository.findByStatusOrderByTeamNameAsc(TeamStatus.AVAILABLE);
    }
}
