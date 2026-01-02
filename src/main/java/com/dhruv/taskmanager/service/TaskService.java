package com.dhruv.taskmanager.service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
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

    // Create 8 sample tasks for the owner if they have none, and return the list.
    public List<Task> ensureSample(@NonNull String owner) {
        List<Task> existing = repo.findByOwner(owner);
        if (!existing.isEmpty()) return existing;

        Instant base = Instant.now().truncatedTo(ChronoUnit.DAYS);
        List<Task> seeds = new ArrayList<>();
        seeds.add(t("Design landing page", "Hero + features", "IN_PROGRESS", "HIGH", base.plus(3, ChronoUnit.DAYS), "alice", owner));
        seeds.add(t("Implement JWT login", "Backend + UI", "OPEN", "HIGH", base.plus(1, ChronoUnit.DAYS), "bob", owner));
        seeds.add(t("Create task CRUD", "API + validations", "OPEN", "MEDIUM", base.plus(5, ChronoUnit.DAYS), "charlie", owner));
        seeds.add(t("Write integration tests", "Auth + tasks", "OPEN", "LOW", base.plus(9, ChronoUnit.DAYS), null, owner));
        seeds.add(t("Analytics charts", "Pie/Bar/Line", "IN_PROGRESS", "MEDIUM", base.plus(7, ChronoUnit.DAYS), "diana", owner));
        seeds.add(t("Fix bug #123", "Status transition", "OPEN", "HIGH", base.plus(2, ChronoUnit.DAYS), null, owner));
        seeds.add(t("Prepare release notes", "v1.0", "DONE", "LOW", base.minus(1, ChronoUnit.DAYS), "ed", owner));
        seeds.add(t("Team sync meeting", "Next sprint", "DONE", "LOW", base, "alice", owner));

        repo.saveAll(seeds);
        return repo.findByOwner(owner);
    }

    private Task t(String title, String desc, String status, String priority, Instant due, String assignee, String owner) {
        Task x = new Task();
        x.setTitle(title);
        x.setDescription(desc);
        x.setStatus(status);
        x.setPriority(priority);
        x.setDueDate(due);
        x.setAssignee(assignee);
        x.setOwner(owner);
        return x;
    }
}
