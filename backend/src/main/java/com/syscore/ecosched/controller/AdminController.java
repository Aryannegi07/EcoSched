package com.syscore.ecosched.controller;

import com.syscore.ecosched.dto.AdminStatsResponse;
import com.syscore.ecosched.service.AdminService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AdminService adminService;

    public AdminController(AdminService adminService) {
        this.adminService = adminService;
    }

    /** Totals for the admin dashboard cards (users, e-waste, request counts per status, team counts). */
    @GetMapping("/stats")
    public AdminStatsResponse stats() {
        return adminService.getStats();
    }

    /** E-waste statistics per category (same data as stats.ewaste_by_category). */
    @GetMapping("/ewaste-stats")
    public List<AdminStatsResponse.CategoryStat> ewasteStats() {
        return adminService.getStats().getEwasteByCategory();
    }
}
