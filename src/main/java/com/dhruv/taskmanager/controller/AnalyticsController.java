package com.dhruv.taskmanager.controller;

import java.security.Principal;
import java.util.List;
import java.util.Objects;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import com.dhruv.taskmanager.dto.AnalyticsDtos.TaskAnalyticsDto;
import com.dhruv.taskmanager.service.AnalyticsCacheService;
import com.dhruv.taskmanager.service.TaskQueryService;
import com.dhruv.taskmanager.model.Task;

@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {

    private final TaskQueryService query;
    private final AnalyticsCacheService cache;

    public AnalyticsController(TaskQueryService query, AnalyticsCacheService cache) {
        this.query = query;
        this.cache = cache;
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(Principal principal) {
        if (principal == null) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        String u = Objects.requireNonNull(principal.getName());
        List<Task> tasks = query.list(u, false);
        return ResponseEntity.ok(cache.getOrCompute("me:" + u, tasks).value());
    }

    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/admin")
    public ResponseEntity<TaskAnalyticsDto> admin(Principal principal) {
        String u = Objects.requireNonNull(principal.getName());
        List<Task> tasks = query.list(u, true);
        return ResponseEntity.ok(cache.getOrCompute("admin", tasks).value());
    }
}