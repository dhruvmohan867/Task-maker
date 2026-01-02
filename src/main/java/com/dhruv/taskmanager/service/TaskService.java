package com.dhruv.taskmanager.service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import org.springframework.lang.NonNull;
import org.springframework.stereotype.Service;

import com.dhruv.taskmanager.model.Task;
import com.dhruv.taskmanager.repository.TaskRepository;

@Service
public class TaskService {

    private final TaskRepository repo;

    public TaskService(TaskRepository repo) {
        this.repo = repo;
    }

    public List<Task> all() {
        return repo.findAll();
    }

    public List<Task> byOwner(@NonNull String owner) {
        return repo.findByOwner(owner);
    }

    public Task get(@NonNull String id) {
        return repo.findById(id).orElse(null);
    }

    public Task save(@NonNull Task task) {
        return repo.save(task);
    }

    public void delete(@NonNull String id) {
        repo.deleteById(id);
    }

    /* -------- business validation -------- */

    public static boolean dueDateValid(Instant dueDate) {
        if (dueDate == null) return true;

        Instant today = Instant.now().truncatedTo(ChronoUnit.DAYS);
        return !dueDate.isBefore(today);
    }
}
