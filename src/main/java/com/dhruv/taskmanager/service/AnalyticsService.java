package com.dhruv.taskmanager.service;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import com.dhruv.taskmanager.dto.AnalyticsDtos.TaskAnalyticsDto;
import com.dhruv.taskmanager.dto.AnalyticsDtos.TrendDto;
import com.dhruv.taskmanager.dto.AnalyticsDtos.UserProductivityDto;
import com.dhruv.taskmanager.model.Task;

@Service
public class AnalyticsService {

    private final TaskPolicyService policy;

    public AnalyticsService(TaskPolicyService policy) {
        this.policy = policy;
    }

    public TaskAnalyticsDto compute(List<Task> tasks) {
        Instant now = Instant.now();
        long total = tasks.size();
        long done = tasks.stream().filter(t -> "DONE".equals(t.getStatus())).count();
        long pending = total - done;
        long overdue = tasks.stream().filter(t -> policy.isOverdue(t, now)).count();

        Map<String, Long> distribution = Map.of(
            "OPEN", tasks.stream().filter(t -> "OPEN".equals(t.getStatus())).count(),
            "IN_PROGRESS", tasks.stream().filter(t -> "IN_PROGRESS".equals(t.getStatus())).count(),
            "DONE", done
        );

        Map<String, Long> priorities = Map.of(
            "LOW", tasks.stream().filter(t -> "LOW".equals(t.getPriority())).count(),
            "MEDIUM", tasks.stream().filter(t -> "MEDIUM".equals(t.getPriority())).count(),
            "HIGH", tasks.stream().filter(t -> "HIGH".equals(t.getPriority())).count()
        );

        TrendDto weekly = weeklyTrend(tasks);

        double completionRate = total == 0 ? 0.0 : (double) done / (double) total;

        List<UserProductivityDto> byOwner = productivity(tasks, Task::getOwner, now);
        List<UserProductivityDto> byAssignee = productivity(tasks, t -> {
            String a = t.getAssignee();
            return (a == null || a.isBlank()) ? "Unassigned" : a.trim();
        }, now);

        return new TaskAnalyticsDto(total, done, pending, overdue, completionRate, distribution, priorities, weekly, byOwner, byAssignee);
    }

    private TrendDto weeklyTrend(List<Task> tasks) {
        // last 8 weeks labels (Mon-based)
        LocalDate today = LocalDate.now();
        List<LocalDate> weekStarts = new ArrayList<>();
        for (int i = 7; i >= 0; i--) {
            weekStarts.add(today.minusWeeks(i).with(DayOfWeek.MONDAY));
        }
        List<String> labels = weekStarts.stream().map(LocalDate::toString).toList();

        long[] openArr = new long[8];
        long[] inProgArr = new long[8];
        long[] doneArr = new long[8];

        Map<String, Integer> idx = new HashMap<>();
        for (int i = 0; i < labels.size(); i++) idx.put(labels.get(i), i);

        for (Task t : tasks) {
            if (t.getDueDate() == null) continue;
            LocalDate wk = t.getDueDate().atZone(ZoneId.systemDefault()).toLocalDate().with(DayOfWeek.MONDAY);
            Integer i = idx.get(wk.toString());
            if (i == null) continue;

            switch (String.valueOf(t.getStatus())) {
                case "OPEN" -> openArr[i]++;
                case "IN_PROGRESS" -> inProgArr[i]++;
                case "DONE" -> doneArr[i]++;
            }
        }

        return new TrendDto(
            labels,
            Arrays.stream(openArr).boxed().toList(),
            Arrays.stream(inProgArr).boxed().toList(),
            Arrays.stream(doneArr).boxed().toList()
        );
    }

    private <K> List<UserProductivityDto> productivity(List<Task> tasks,
                                                       java.util.function.Function<Task, K> keyFn,
                                                       Instant now) {
        Map<K, List<Task>> groups = tasks.stream().collect(Collectors.groupingBy(keyFn));
        return groups.entrySet().stream()
            .map(e -> {
                List<Task> list = e.getValue();
                long total = list.size();
                long done = list.stream().filter(t -> "DONE".equals(t.getStatus())).count();
                long overdue = list.stream().filter(t -> policy.isOverdue(t, now)).count();
                return new UserProductivityDto(String.valueOf(e.getKey()), total, done, overdue);
            })
            .sorted(Comparator.comparingLong(UserProductivityDto::total).reversed())
            .toList();
    }
}