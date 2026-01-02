package com.dhruv.taskmanager.repository;

import java.util.List;
import org.springframework.data.mongodb.repository.MongoRepository;
import com.dhruv.taskmanager.model.Task;

public interface TaskRepository extends MongoRepository<Task, String> {
    List<Task> findByOwner(String owner);
}
