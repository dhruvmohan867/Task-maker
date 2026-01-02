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
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;

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

        Map<String,Object> distribution = Map.of("OPEN", open, "IN_PROGRESS", inProgress, "DONE", done);

        long low = tasks.stream().filter(t -> "LOW".equals(t.getPriority())).count();
        long med = tasks.stream().filter(t -> "MEDIUM".equals(t.getPriority())).count();
        long high = tasks.stream().filter(t -> "HIGH".equals(t.getPriority())).count();
        Map<String,Object> priorities = Map.of("LOW", low, "MEDIUM", med, "HIGH", high);

        // Weekly trend (last 8 weeks) by dueDate week start (Mon)
        LocalDate today = LocalDate.now();
        List<String> labels = new ArrayList<>();
        for (int i = 7; i >= 0; i--) {
            LocalDate weekStart = today.minusWeeks(i).with(DayOfWeek.MONDAY);
            labels.add(weekStart.toString());
        }

        // Build arrays
        String[] labelArr = labels.toArray(new String[0]);
        long[] openArr = new long[8];
        long[] inProgressArr = new long[8];
        long[] doneArr = new long[8];

        tasks.forEach(t -> {
            if (t.getDueDate() == null) return;
            LocalDate d = t.getDueDate().atZone(ZoneId.systemDefault()).toLocalDate().with(DayOfWeek.MONDAY);
            int idx = labels.indexOf(d.toString());
            if (idx >= 0) {
                switch (t.getStatus()) {
                    case "OPEN" -> openArr[idx]++;
                    case "IN_PROGRESS" -> inProgressArr[idx]++;
                    case "DONE" -> doneArr[idx]++;
                }
            }
        });

        // Package weekly stats
        Map<String,Object> weekly = new LinkedHashMap<>();
        weekly.put("labels", labelArr);
        weekly.put("OPEN", openArr);
        weekly.put("IN_PROGRESS", inProgressArr);
        weekly.put("DONE", doneArr);

        Map<String,Object> resp = new HashMap<>();
        resp.put("total", total);
        resp.put("assigned", assigned);
        resp.put("done", done);
        resp.put("distribution", distribution);
        resp.put("priorities", priorities);
        resp.put("weekly", weekly);
        return resp;
    }
}