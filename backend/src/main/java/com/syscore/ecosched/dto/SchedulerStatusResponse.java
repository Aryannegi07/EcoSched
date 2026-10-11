package com.syscore.ecosched.dto;

import java.util.List;

/** Result of GET /api/scheduler/status. */
public class SchedulerStatusResponse {

    public static class TeamInfo {
        private final Long teamId;
        private final String teamName;
        private final String status;
        private final Long currentRequestId;   // null when the team is not handling a request
        private final String contactPhone;
        private final String vehicleNumber;
        private final Long currentTask;         // collection_teams.current_task straight from MySQL
        private final Integer currentPriority;  // priority of that request (null if none)

        public TeamInfo(Long teamId, String teamName, String status, Long currentRequestId,
                        String contactPhone, String vehicleNumber, Long currentTask, Integer currentPriority) {
            this.contactPhone = contactPhone;
            this.vehicleNumber = vehicleNumber;
            this.currentTask = currentTask;
            this.currentPriority = currentPriority;
            this.teamId = teamId;
            this.teamName = teamName;
            this.status = status;
            this.currentRequestId = currentRequestId;
        }
        public Long getTeamId() { return teamId; }
        public String getTeamName() { return teamName; }
        public String getStatus() { return status; }
        public Long getCurrentRequestId() { return currentRequestId; }
        public String getContactPhone() { return contactPhone; }
        public String getVehicleNumber() { return vehicleNumber; }
        public Long getCurrentTask() { return currentTask; }
        public Integer getCurrentPriority() { return currentPriority; }
    }

    private final String policy = "NON_PREEMPTIVE_PRIORITY";
    private final String engine = "C program scheduler/ecosched_scheduler (process bridge)";
    private final boolean engineAvailable;
    private final long pendingRequests;
    private final long assignedRequests;
    private final long inProgressRequests;
    private final long completedRequests;
    private final long availableTeams;
    private final long busyTeams;
    private final List<TeamInfo> teams;
    private final long integrityViolations;      // rows in v_integrity_violations (0 = consistent)
    private final SchedulerRunResponse lastRun;  // most recent POST /run result kept by the backend (may be null)

    public SchedulerStatusResponse(boolean engineAvailable, long pendingRequests, long assignedRequests,
                                   long inProgressRequests, long completedRequests,
                                   long availableTeams, long busyTeams, List<TeamInfo> teams,
                                   long integrityViolations, SchedulerRunResponse lastRun) {
        this.integrityViolations = integrityViolations;
        this.lastRun = lastRun;
        this.engineAvailable = engineAvailable;
        this.pendingRequests = pendingRequests;
        this.assignedRequests = assignedRequests;
        this.inProgressRequests = inProgressRequests;
        this.completedRequests = completedRequests;
        this.availableTeams = availableTeams;
        this.busyTeams = busyTeams;
        this.teams = teams;
    }

    public String getPolicy() { return policy; }
    public String getEngine() { return engine; }
    public boolean isEngineAvailable() { return engineAvailable; }
    public long getPendingRequests() { return pendingRequests; }
    public long getAssignedRequests() { return assignedRequests; }
    public long getInProgressRequests() { return inProgressRequests; }
    public long getCompletedRequests() { return completedRequests; }
    public long getAvailableTeams() { return availableTeams; }
    public long getBusyTeams() { return busyTeams; }
    public List<TeamInfo> getTeams() { return teams; }
    public long getIntegrityViolations() { return integrityViolations; }
    public SchedulerRunResponse getLastRun() { return lastRun; }
}
