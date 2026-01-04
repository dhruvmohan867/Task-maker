package com.dhruv.taskmanager.controller;

import java.security.Principal;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import com.dhruv.taskmanager.dto.AnalyticsDtos.TaskAnalyticsDto;
import com.dhruv.taskmanager.service.AnalyticsService;
import com.dhruv.taskmanager.service.TaskQueryService;

@RestController
@RequestMapping("/api/stats")
public class StatsController {

    private final TaskQueryService query;
    private final AnalyticsService analytics;

    public StatsController(TaskQueryService query, AnalyticsService analytics) {
        this.query = query;
        this.analytics = analytics;
    }

    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/admin")
    public ResponseEntity<?> admin() {
        // Keep old response shape (non-breaking)
        TaskAnalyticsDto dto = analytics.compute(query.list("admin", true));
        return ResponseEntity.ok(toLegacy(dto));
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(Principal principal) {
        var tasks = query.list(Objects.requireNonNull(principal.getName()), false);
        TaskAnalyticsDto dto = analytics.compute(tasks);
        return ResponseEntity.ok(toLegacy(dto));
    }

    private Map<String, Object> toLegacy(TaskAnalyticsDto dto) {
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("total", dto.total());
        resp.put("assigned", dto.byAssignee().stream().filter(x -> !"Unassigned".equals(x.user())).mapToLong(x -> x.total()).sum());
        resp.put("done", dto.done());
        resp.put("distribution", dto.distribution());
        resp.put("priorities", dto.priorities());

        Map<String, Object> weekly = new LinkedHashMap<>();
        weekly.put("labels", dto.weekly().labels().toArray(new String[0]));
        weekly.put("OPEN", dto.weekly().open().stream().mapToLong(Long::longValue).toArray());
        weekly.put("IN_PROGRESS", dto.weekly().inProgress().stream().mapToLong(Long::longValue).toArray());
        weekly.put("DONE", dto.weekly().done().stream().mapToLong(Long::longValue).toArray());
        resp.put("weekly", weekly);

        return resp;
    }
}