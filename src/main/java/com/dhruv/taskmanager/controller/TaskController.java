package com.dhruv.taskmanager.controller;

import java.security.Principal;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.lang.NonNull;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import com.dhruv.taskmanager.model.Task;
import com.dhruv.taskmanager.service.TaskService;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {

    private final TaskService service;

    public TaskController(TaskService service) {
        this.service = service;
    }

    /* ================= GET ALL ================= */

    @GetMapping
    public ResponseEntity<List<Task>> list(Principal principal) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        List<Task> tasks = isAdmin()
                ? service.all()
                : service.byOwner(Objects.requireNonNull(principal.getName()));

        return ResponseEntity.ok(tasks);
    }

    /* ================= GET BY ID ================= */

    @GetMapping("/{id}")
    public ResponseEntity<?> get(
            @PathVariable @NonNull String id,
            Principal principal
    ) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        Task task = service.get(id);
        if (task == null) {
            return ResponseEntity.notFound().build();
        }

        return ResponseEntity.ok(task);
    }

    /* ================= CREATE ================= */

    @PostMapping
    public ResponseEntity<?> create(
            @RequestBody Task task,
            Principal principal
    ) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        task.setId(null);
        task.setOwner(Objects.requireNonNull(principal.getName()));

        if (!TaskService.dueDateValid(task.getDueDate())) {
            return bad("due date cannot be in the past");
        }

        if (task.getStatus() == null) {
            task.setStatus("OPEN");
        }

        if (task.getPriority() == null) {
            task.setPriority("MEDIUM");
        }

        return ResponseEntity.ok(service.save(task));
    }

    /* ================= UPDATE ================= */

    @PutMapping("/{id}")
    public ResponseEntity<?> update(
            @PathVariable @NonNull String id,
            @RequestBody Task task,
            Principal principal
    ) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        Task existing = service.get(id);
        if (existing == null) {
            return ResponseEntity.notFound().build();
        }

        if (!validTransition(existing.getStatus(), task.getStatus())) {
            return bad("invalid status transition "
                    + existing.getStatus() + " -> " + task.getStatus());
        }

        if (!TaskService.dueDateValid(task.getDueDate())) {
            return bad("due date cannot be in the past");
        }

        task.setId(id);

        if (!isAdmin()) {
            task.setOwner(Objects.requireNonNull(principal.getName()));
        }

        return ResponseEntity.ok(service.save(task));
    }

    /* ================= DELETE ================= */

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(
            @PathVariable @NonNull String id,
            Principal principal
    ) {
        if (principal == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        if (!isAdmin()) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "admin only"));
        }

        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    /* ================= HELPERS ================= */

    private boolean isAdmin() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null &&
               auth.getAuthorities().stream()
                   .anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"));
    }

    private boolean validTransition(String from, String to) {
        if (from == null || to == null) return false;
        if (from.equals(to)) return true;

        return (from.equals("OPEN") && to.equals("IN_PROGRESS")) ||
               (from.equals("IN_PROGRESS") && to.equals("DONE"));
    }

    private ResponseEntity<?> bad(String message) {
        return ResponseEntity.badRequest()
                .body(Map.of("error", message));
    }
}
