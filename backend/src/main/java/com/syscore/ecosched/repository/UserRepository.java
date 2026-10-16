package com.syscore.ecosched.repository;

import com.syscore.ecosched.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {

    boolean existsByEmail(String email);
    Optional<User> findByEmailIgnoreCase(String email);
}
