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
import com.dhruv.taskmanager.service.TaskCommandService;
import com.dhruv.taskmanager.service.TaskQueryService;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {

    private final TaskQueryService query;
    private final TaskCommandService command;

    public TaskController(TaskQueryService query, TaskCommandService command) {
        this.query = query;
        this.command = command;
    }

    @GetMapping
    public ResponseEntity<List<Task>> list(Principal principal) {
        if (principal == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        String u = Objects.requireNonNull(principal.getName());
        return ResponseEntity.ok(query.list(u, isAdmin()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> get(@PathVariable @NonNull String id, Principal principal) {
        if (principal == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        String u = Objects.requireNonNull(principal.getName());
        try {
            Task t = query.get(id, u, isAdmin());
            if (t == null) return ResponseEntity.notFound().build();
            return ResponseEntity.ok(t);
        } catch (SecurityException se) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "forbidden"));
        }
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Task task, Principal principal) {
        if (principal == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        String u = Objects.requireNonNull(principal.getName());
        try {
            return ResponseEntity.ok(command.create(task, u));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable @NonNull String id, @RequestBody Task task, Principal principal) {
        if (principal == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        String u = Objects.requireNonNull(principal.getName());
        try {
            Task saved = command.update(id, task, u, isAdmin());
            if (saved == null) return ResponseEntity.notFound().build();
            return ResponseEntity.ok(saved);
        } catch (SecurityException se) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "forbidden"));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable @NonNull String id, Principal principal) {
        if (principal == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        String u = Objects.requireNonNull(principal.getName());
        try {
            command.delete(id, u, isAdmin());
            return ResponseEntity.noContent().build();
        } catch (SecurityException se) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "admin only"));
        }
    }

    private boolean isAdmin() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null &&
               auth.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("ROLE_ADMIN"));
    }
}
