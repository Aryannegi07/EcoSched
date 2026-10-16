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
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;

@RestController
@RequestMapping("/api/ewaste")
public class EWasteController {

    private final EWasteService eWasteService;
    private final AuthController auth;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper = new com.fasterxml.jackson.databind.ObjectMapper();
    private final com.syscore.ecosched.service.ImageStorageService images;

    public EWasteController(EWasteService eWasteService, AuthController auth, com.syscore.ecosched.service.ImageStorageService images) {
        this.eWasteService = eWasteService;
        this.auth = auth;
        this.images = images;
    }
    @PostMapping(consumes = "multipart/form-data") @ResponseStatus(HttpStatus.CREATED)
    public EWasteResponse createWithImage(@RequestPart("data") String data, @RequestPart(value="image", required=false) MultipartFile image, HttpServletRequest http) throws Exception {
        EWasteRequest request=objectMapper.readValue(data, EWasteRequest.class); request.setUserId(auth.current(http).getUserId()); EWasteResponse result=eWasteService.createItem(request); if(image!=null&&!image.isEmpty()){String path=images.save(image); eWasteService.setImage(result.getItemId(),path); result=eWasteService.getItemById(result.getItemId());} return result;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public EWasteResponse createItem(@Valid @RequestBody EWasteRequest request, HttpServletRequest http) {
        request.setUserId(auth.current(http).getUserId());
        return eWasteService.createItem(request);
    }

    @GetMapping
    public List<EWasteResponse> getAllItems(HttpServletRequest http) {
        return auth.admin(http) ? eWasteService.getAllItems() : eWasteService.getItemsForUser(auth.current(http).getUserId());
    }

    @GetMapping("/{id}")
    public EWasteResponse getItemById(@PathVariable Long id, HttpServletRequest http) {
        EWasteResponse item=eWasteService.getItemById(id);
        if(!auth.admin(http) && !item.getUserId().equals(auth.current(http).getUserId())) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND,"E-waste item not found");
        return item;
    }
}
