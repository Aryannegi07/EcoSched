package com.syscore.ecosched.repository;

import com.syscore.ecosched.entity.CollectionTeam;
import com.syscore.ecosched.entity.TeamStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface CollectionTeamRepository extends JpaRepository<CollectionTeam, Long> {

    boolean existsByTeamName(String teamName);

    List<CollectionTeam> findByStatusOrderByTeamNameAsc(TeamStatus status);

    /** All teams, locked (SELECT ... FOR UPDATE) for the duration of a scheduler transaction. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from CollectionTeam t order by t.teamId")
    List<CollectionTeam> findAllForUpdate();

    long countByStatus(TeamStatus status);
}
