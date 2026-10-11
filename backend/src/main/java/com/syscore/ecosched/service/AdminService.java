package com.syscore.ecosched.service;

import com.syscore.ecosched.dto.AdminStatsResponse;
import com.syscore.ecosched.entity.EWasteCategory;
import com.syscore.ecosched.entity.RequestStatus;
import com.syscore.ecosched.entity.TeamStatus;
import com.syscore.ecosched.repository.CollectionTeamRepository;
import com.syscore.ecosched.repository.EWasteRepository;
import com.syscore.ecosched.repository.PickupRequestRepository;
import com.syscore.ecosched.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/** Dashboard numbers. Everything is computed by MySQL (COUNT / SUM / GROUP BY), nothing is cached. */
@Service
@Transactional(readOnly = true)
public class AdminService {

    private final UserRepository userRepository;
    private final EWasteRepository eWasteRepository;
    private final PickupRequestRepository requestRepository;
    private final CollectionTeamRepository teamRepository;

    public AdminService(UserRepository userRepository, EWasteRepository eWasteRepository,
                        PickupRequestRepository requestRepository, CollectionTeamRepository teamRepository) {
        this.userRepository = userRepository;
        this.eWasteRepository = eWasteRepository;
        this.requestRepository = requestRepository;
        this.teamRepository = teamRepository;
    }

    public AdminStatsResponse getStats() {
        List<AdminStatsResponse.CategoryStat> byCategory = new ArrayList<>();
        for (Object[] row : eWasteRepository.statsByCategory()) {
            byCategory.add(new AdminStatsResponse.CategoryStat(
                    ((EWasteCategory) row[0]).name(),
                    ((Number) row[1]).longValue(),
                    ((Number) row[2]).longValue(),
                    (BigDecimal) row[3]));
        }
        BigDecimal kg = eWasteRepository.totalWeightKg();
        Long units = eWasteRepository.totalUnits();
        return new AdminStatsResponse(
                userRepository.count(),
                eWasteRepository.count(),
                units == null ? 0 : units,
                kg == null ? BigDecimal.ZERO : kg,
                requestRepository.countByStatus(RequestStatus.PENDING),
                requestRepository.countByStatus(RequestStatus.ASSIGNED),
                requestRepository.countByStatus(RequestStatus.IN_PROGRESS),
                requestRepository.countByStatus(RequestStatus.COMPLETED),
                requestRepository.countByStatus(RequestStatus.CANCELLED),
                teamRepository.countByStatus(TeamStatus.AVAILABLE),
                teamRepository.countByStatus(TeamStatus.BUSY),
                requestRepository.countIntegrityViolations(),
                byCategory);
    }
}
