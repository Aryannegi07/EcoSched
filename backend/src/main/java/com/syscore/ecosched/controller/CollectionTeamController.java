package com.syscore.ecosched.controller;

import com.syscore.ecosched.dto.CollectionTeamRequest;
import com.syscore.ecosched.dto.CollectionTeamUpdateRequest;
import com.syscore.ecosched.entity.CollectionTeam;
import com.syscore.ecosched.service.CollectionTeamService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/teams")
public class CollectionTeamController {

    private final CollectionTeamService teamService;

    public CollectionTeamController(CollectionTeamService teamService) {
        this.teamService = teamService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CollectionTeam createTeam(@Valid @RequestBody CollectionTeamRequest request) {
        return teamService.createTeam(request);
    }

    @GetMapping
    public List<CollectionTeam> getAllTeams() {
        return teamService.getAllTeams();
    }

    @PutMapping("/{id}")
    public CollectionTeam updateTeam(@PathVariable Long id, @Valid @RequestBody CollectionTeamUpdateRequest request) {
        return teamService.updateTeam(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteTeam(@PathVariable Long id) {
        teamService.deleteTeam(id);
    }

    @GetMapping("/available")
    public List<CollectionTeam> getAvailableTeams() {
        return teamService.getAvailableTeams();
    }
}
