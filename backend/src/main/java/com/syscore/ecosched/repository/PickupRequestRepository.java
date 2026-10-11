package com.syscore.ecosched.repository;

import com.syscore.ecosched.entity.PickupRequest;
import com.syscore.ecosched.entity.RequestStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import java.util.Collection;
import java.util.List;

public interface PickupRequestRepository extends JpaRepository<PickupRequest, Long> {

    /** Pending requests, oldest first (first come, first served). */
    List<PickupRequest> findByStatusOrderByRequestTimeAsc(RequestStatus status);

    /** Pending requests, highest priority first; ties go to the oldest request. */
    List<PickupRequest> findByStatusOrderByPriorityDescRequestTimeAsc(RequestStatus status);

    /** True if this item already has a request in one of the given statuses. */
    boolean existsByItem_ItemIdAndStatusIn(Long itemId, Collection<RequestStatus> statuses);

    /** Same rows, but locked (SELECT ... FOR UPDATE) so two scheduler runs cannot assign the same request. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    List<PickupRequest> findByStatusIn(Collection<RequestStatus> statuses);

    /** Read-only (no lock) version used by the status endpoint. */
    List<PickupRequest> findByStatusInOrderByRequestIdAsc(Collection<RequestStatus> statuses);

    long countByStatus(RequestStatus status);

    /** True if the team has ever been given a request (blocks deleting the team: FK RESTRICT). */
    boolean existsByTeam_TeamId(Long teamId);

    /** All requests of one user, newest first (user request history). */
    List<PickupRequest> findByUser_UserIdOrderByRequestTimeDesc(Long userId);

    /** Rows of the v_integrity_violations view: 0 means pickup_requests and collection_teams agree. */
    @org.springframework.data.jpa.repository.Query(value = "SELECT COUNT(*) FROM v_integrity_violations", nativeQuery = true)
    long countIntegrityViolations();
}
