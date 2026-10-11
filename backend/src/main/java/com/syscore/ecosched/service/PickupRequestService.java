package com.syscore.ecosched.service;

import com.syscore.ecosched.dto.PickupRequestCreateRequest;
import com.syscore.ecosched.dto.PickupRequestResponse;
import com.syscore.ecosched.entity.EWaste;
import com.syscore.ecosched.entity.PickupRequest;
import com.syscore.ecosched.entity.RequestStatus;
import com.syscore.ecosched.entity.User;
import com.syscore.ecosched.exception.BadRequestException;
import com.syscore.ecosched.exception.ConflictException;
import com.syscore.ecosched.exception.ResourceNotFoundException;
import com.syscore.ecosched.repository.EWasteRepository;
import com.syscore.ecosched.repository.PickupRequestRepository;
import com.syscore.ecosched.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@Transactional(readOnly = true)
public class PickupRequestService {

    /** A request in one of these statuses is still "open" for its item. */
    private static final List<RequestStatus> ACTIVE_STATUSES =
            List.of(RequestStatus.PENDING, RequestStatus.ASSIGNED, RequestStatus.IN_PROGRESS);

    private final PickupRequestRepository requestRepository;
    private final UserRepository userRepository;
    private final EWasteRepository eWasteRepository;

    public PickupRequestService(PickupRequestRepository requestRepository,
                                UserRepository userRepository,
                                EWasteRepository eWasteRepository) {
        this.requestRepository = requestRepository;
        this.userRepository = userRepository;
        this.eWasteRepository = eWasteRepository;
    }

    @Transactional
    public PickupRequestResponse createRequest(PickupRequestCreateRequest dto) {
        User user = userRepository.findById(dto.getUserId())
                .orElseThrow(() -> new ResourceNotFoundException("User not found with id " + dto.getUserId()));

        EWaste item = eWasteRepository.findById(dto.getItemId())
                .orElseThrow(() -> new ResourceNotFoundException("E-waste item not found with id " + dto.getItemId()));

        // Business rule 1: the item must belong to the user who is asking for the pickup.
        if (!item.getUser().getUserId().equals(user.getUserId())) {
            throw new BadRequestException("Item " + item.getItemId() + " does not belong to user " + user.getUserId());
        }

        // Business rule 2: one open request per item.
        if (requestRepository.existsByItem_ItemIdAndStatusIn(item.getItemId(), ACTIVE_STATUSES)) {
            throw new ConflictException("Item " + item.getItemId() + " already has an open pickup request");
        }

        PickupRequest request = new PickupRequest();
        request.setUser(user);
        request.setItem(item);
        request.setLocation(dto.getLocation().trim());
        request.setPriority(dto.getPriority() == null ? 1 : dto.getPriority());
        request.setStatus(RequestStatus.PENDING);   // team stays null until the scheduler assigns one

        return PickupRequestResponse.from(requestRepository.save(request));
    }

    public List<PickupRequestResponse> getAllRequests() {
        return requestRepository.findAll().stream().map(PickupRequestResponse::from).toList();
    }

    /** All requests of one user, newest first. */
    public List<PickupRequestResponse> getRequestsForUser(Long userId) {
        if (!userRepository.existsById(userId)) {
            throw new ResourceNotFoundException("User not found with id " + userId);
        }
        return requestRepository.findByUser_UserIdOrderByRequestTimeDesc(userId)
                .stream().map(PickupRequestResponse::from).toList();
    }

    public PickupRequestResponse getRequestById(Long id) {
        PickupRequest request = requestRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Pickup request not found with id " + id));
        return PickupRequestResponse.from(request);
    }

    /** PENDING requests, oldest first (FCFS order). */
    public List<PickupRequestResponse> getPendingRequests() {
        return requestRepository.findByStatusOrderByRequestTimeAsc(RequestStatus.PENDING)
                .stream().map(PickupRequestResponse::from).toList();
    }

    /** PENDING requests as a priority queue: highest priority first, oldest first on ties. */
    public List<PickupRequestResponse> getPriorityQueue() {
        return requestRepository.findByStatusOrderByPriorityDescRequestTimeAsc(RequestStatus.PENDING)
                .stream().map(PickupRequestResponse::from).toList();
    }
}
