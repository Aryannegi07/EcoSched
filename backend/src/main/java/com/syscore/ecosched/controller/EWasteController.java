package com.syscore.ecosched.controller;

import com.syscore.ecosched.dto.EWasteRequest;
import com.syscore.ecosched.dto.EWasteResponse;
import com.syscore.ecosched.service.EWasteService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/ewaste")
public class EWasteController {

    private final EWasteService eWasteService;

    public EWasteController(EWasteService eWasteService) {
        this.eWasteService = eWasteService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public EWasteResponse createItem(@Valid @RequestBody EWasteRequest request) {
        return eWasteService.createItem(request);
    }

    @GetMapping
    public List<EWasteResponse> getAllItems() {
        return eWasteService.getAllItems();
    }

    @GetMapping("/{id}")
    public EWasteResponse getItemById(@PathVariable Long id) {
        return eWasteService.getItemById(id);
    }
}
