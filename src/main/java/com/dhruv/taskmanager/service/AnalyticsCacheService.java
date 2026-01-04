package com.dhruv.taskmanager.service;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

import com.dhruv.taskmanager.dto.AnalyticsDtos.TaskAnalyticsDto;
import com.dhruv.taskmanager.model.Task;

@Service
public class AnalyticsCacheService {

    public record Cached<T>(T value, Instant computedAt) {}

    private final AnalyticsService analytics;
    private final Map<String, Cached<TaskAnalyticsDto>> cache = new ConcurrentHashMap<>();

    public AnalyticsCacheService(AnalyticsService analytics) {
        this.analytics = analytics;
    }

    public Cached<TaskAnalyticsDto> getOrCompute(String key, List<Task> tasks) {
        return cache.compute(key, (k, old) -> new Cached<>(analytics.compute(tasks), Instant.now()));
    }

    public void evict(String key) {
        cache.remove(key);
    }

    public void clear() {
        cache.clear();
    }
}