package com.syscore.ecosched.controller;

import com.syscore.ecosched.dto.SchedulerQueueItem;
import com.syscore.ecosched.dto.SchedulerRunResponse;
import com.syscore.ecosched.dto.SchedulerStatusResponse;
import com.syscore.ecosched.service.SchedulerService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/scheduler")
public class SchedulerController {

    private final SchedulerService schedulerService;

    public SchedulerController(SchedulerService schedulerService) {
        this.schedulerService = schedulerService;
    }

    /** Runs the C priority scheduler once and saves the assignments. */
    @PostMapping("/run")
    public SchedulerRunResponse run() {
        return schedulerService.run();
    }

    @GetMapping("/queue")
    public List<SchedulerQueueItem> queue() {
        return schedulerService.getQueue();
    }

    @GetMapping("/status")
    public SchedulerStatusResponse status() {
        return schedulerService.getStatus();
    }
}
