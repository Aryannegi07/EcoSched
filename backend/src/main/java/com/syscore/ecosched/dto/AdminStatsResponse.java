package com.syscore.ecosched.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/** Result of GET /api/admin/stats. Every number is a COUNT / SUM computed by MySQL. */
public class AdminStatsResponse {

    /** One row of the per-category e-waste statistics (GROUP BY category). */
    public static class CategoryStat {
        private final String category;
        private final long itemRecords;
        private final long totalUnits;
        private final BigDecimal totalWeightKg;

        public CategoryStat(String category, long itemRecords, long totalUnits, BigDecimal totalWeightKg) {
            this.category = category;
            this.itemRecords = itemRecords;
            this.totalUnits = totalUnits;
            this.totalWeightKg = totalWeightKg;
        }
        public String getCategory() { return category; }
        public long getItemRecords() { return itemRecords; }
        public long getTotalUnits() { return totalUnits; }
        public BigDecimal getTotalWeightKg() { return totalWeightKg; }
    }

    private final long totalUsers;
    private final long totalEwasteItems;
    private final long totalEwasteUnits;
    private final BigDecimal totalEwasteKg;
    private final long pendingRequests;
    private final long assignedRequests;
    private final long inProgressRequests;
    private final long completedRequests;
    private final long cancelledRequests;
    private final long availableTeams;
    private final long busyTeams;
    private final long integrityViolations;
    private final List<CategoryStat> ewasteByCategory;
    private final LocalDateTime generatedAt = LocalDateTime.now();

    public AdminStatsResponse(long totalUsers, long totalEwasteItems, long totalEwasteUnits, BigDecimal totalEwasteKg,
                              long pendingRequests, long assignedRequests, long inProgressRequests,
                              long completedRequests, long cancelledRequests,
                              long availableTeams, long busyTeams, long integrityViolations,
                              List<CategoryStat> ewasteByCategory) {
        this.totalUsers = totalUsers;
        this.totalEwasteItems = totalEwasteItems;
        this.totalEwasteUnits = totalEwasteUnits;
        this.totalEwasteKg = totalEwasteKg;
        this.pendingRequests = pendingRequests;
        this.assignedRequests = assignedRequests;
        this.inProgressRequests = inProgressRequests;
        this.completedRequests = completedRequests;
        this.cancelledRequests = cancelledRequests;
        this.availableTeams = availableTeams;
        this.busyTeams = busyTeams;
        this.integrityViolations = integrityViolations;
        this.ewasteByCategory = ewasteByCategory;
    }

    public long getTotalUsers() { return totalUsers; }
    public long getTotalEwasteItems() { return totalEwasteItems; }
    public long getTotalEwasteUnits() { return totalEwasteUnits; }
    public BigDecimal getTotalEwasteKg() { return totalEwasteKg; }
    public long getPendingRequests() { return pendingRequests; }
    public long getAssignedRequests() { return assignedRequests; }
    public long getInProgressRequests() { return inProgressRequests; }
    public long getCompletedRequests() { return completedRequests; }
    public long getCancelledRequests() { return cancelledRequests; }
    public long getAvailableTeams() { return availableTeams; }
    public long getBusyTeams() { return busyTeams; }
    public long getIntegrityViolations() { return integrityViolations; }
    public List<CategoryStat> getEwasteByCategory() { return ewasteByCategory; }
    public LocalDateTime getGeneratedAt() { return generatedAt; }
}
