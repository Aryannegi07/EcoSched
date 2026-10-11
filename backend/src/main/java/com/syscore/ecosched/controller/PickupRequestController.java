package com.syscore.ecosched.controller;

import com.syscore.ecosched.dto.PickupRequestCreateRequest;
import com.syscore.ecosched.dto.PickupRequestResponse;
import com.syscore.ecosched.service.PickupRequestService;
import com.syscore.ecosched.service.SchedulerService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/requests")
public class PickupRequestController {

    private final PickupRequestService requestService;
    private final SchedulerService schedulerService;

    public PickupRequestController(PickupRequestService requestService, SchedulerService schedulerService) {
        this.requestService = requestService;
        this.schedulerService = schedulerService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PickupRequestResponse createRequest(@Valid @RequestBody PickupRequestCreateRequest request) {
        return requestService.createRequest(request);
    }

    @GetMapping
    public List<PickupRequestResponse> getAllRequests() {
        return requestService.getAllRequests();
    }

    // Fixed paths ("/pending", "/priority") win over "/{id}" in Spring MVC.
    @GetMapping("/pending")
    public List<PickupRequestResponse> getPendingRequests() {
        return requestService.getPendingRequests();
    }

    @GetMapping("/priority")
    public List<PickupRequestResponse> getPriorityQueue() {
        return requestService.getPriorityQueue();
    }

    @GetMapping("/user/{userId}")
    public List<PickupRequestResponse> getRequestsForUser(@PathVariable Long userId) {
        return requestService.getRequestsForUser(userId);
    }

    @GetMapping("/{id}")
    public PickupRequestResponse getRequestById(@PathVariable Long id) {
        return requestService.getRequestById(id);
    }

    /** Team arrived and started the pickup: ASSIGNED -> IN_PROGRESS (team stays BUSY). */
    @PutMapping("/{id}/start")
    public PickupRequestResponse startRequest(@PathVariable Long id) {
        return schedulerService.startRequest(id);
    }

    /** Cancel an open request; if a team was working on it, the team becomes AVAILABLE again. */
    @PutMapping("/{id}/cancel")
    public PickupRequestResponse cancelRequest(@PathVariable Long id) {
        return schedulerService.cancelRequest(id);
    }

    /** Pickup finished: request -> COMPLETED and its collection team -> AVAILABLE. */
    @PutMapping("/{id}/complete")
    public PickupRequestResponse completeRequest(@PathVariable Long id) {
        return schedulerService.completeRequest(id);
    }
}
