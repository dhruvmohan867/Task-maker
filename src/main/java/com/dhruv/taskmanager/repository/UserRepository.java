package com.dhruv.taskmanager.repository;

import java.util.Optional;
import org.springframework.data.mongodb.repository.MongoRepository;
import com.dhruv.taskmanager.model.User;

public interface UserRepository extends MongoRepository<User, String> {
    Optional<User> findByUsername(String username);
}
