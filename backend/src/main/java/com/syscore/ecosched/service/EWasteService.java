package com.syscore.ecosched.service;

import com.syscore.ecosched.dto.EWasteRequest;
import com.syscore.ecosched.dto.EWasteResponse;
import com.syscore.ecosched.entity.EWaste;
import com.syscore.ecosched.entity.ItemCondition;
import com.syscore.ecosched.entity.User;
import com.syscore.ecosched.exception.ResourceNotFoundException;
import com.syscore.ecosched.repository.EWasteRepository;
import com.syscore.ecosched.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@Transactional(readOnly = true)
public class EWasteService {

    private final EWasteRepository eWasteRepository;
    private final UserRepository userRepository;

    public EWasteService(EWasteRepository eWasteRepository, UserRepository userRepository) {
        this.eWasteRepository = eWasteRepository;
        this.userRepository = userRepository;
    }

    @Transactional
    public EWasteResponse createItem(EWasteRequest request) {
        User owner = userRepository.findById(request.getUserId())
                .orElseThrow(() -> new ResourceNotFoundException("User not found with id " + request.getUserId()));

        EWaste item = new EWaste();
        item.setUser(owner);
        item.setItemName(request.getItemName().trim());
        item.setCategory(request.getCategory());
        item.setItemCondition(request.getItemCondition() == null ? ItemCondition.NON_WORKING : request.getItemCondition());
        item.setQuantity(request.getQuantity() == null ? 1 : request.getQuantity());
        item.setWeightKg(request.getWeightKg());
        item.setDescription(request.getDescription());

        return EWasteResponse.from(eWasteRepository.save(item));
    }

    public List<EWasteResponse> getAllItems() {
        return eWasteRepository.findAll().stream().map(EWasteResponse::from).toList();
    }

    public EWasteResponse getItemById(Long id) {
        EWaste item = eWasteRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("E-waste item not found with id " + id));
        return EWasteResponse.from(item);
    }
}
