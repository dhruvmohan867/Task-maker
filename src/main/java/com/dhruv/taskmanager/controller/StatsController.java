package com.dhruv.taskmanager.controller;
import java.util.Objects;
import java.security.Principal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import com.dhruv.taskmanager.model.Task;
import com.dhruv.taskmanager.service.TaskService;

@RestController
@RequestMapping("/api/stats")
public class StatsController {
    private final TaskService service;
    public StatsController(TaskService service) { this.service = service; }

    @GetMapping("/admin")
    public ResponseEntity<?> admin() {
        return ResponseEntity.ok(stats(service.all()));
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(Principal principal) {
        var tasks = service.byOwner(Objects.requireNonNull(principal.getName()));

        return ResponseEntity.ok(stats(tasks));
    }

    private Map<String,Object> stats(List<Task> tasks) {
        long total = tasks.size();
        long open = tasks.stream().filter(t -> "OPEN".equals(t.getStatus())).count();
        long inProgress = tasks.stream().filter(t -> "IN_PROGRESS".equals(t.getStatus())).count();
        long done = tasks.stream().filter(t -> "DONE".equals(t.getStatus())).count();
        long assigned = tasks.stream().filter(t -> t.getAssignee() != null && !t.getAssignee().isBlank()).count();
        Map<String,Object> dist = Map.of("OPEN", open, "IN_PROGRESS", inProgress, "DONE", done);
        Map<String,Object> resp = new HashMap<>();
        resp.put("total", total);
        resp.put("assigned", assigned);
        resp.put("done", done);
        resp.put("distribution", dist);
        return resp;
    }
}