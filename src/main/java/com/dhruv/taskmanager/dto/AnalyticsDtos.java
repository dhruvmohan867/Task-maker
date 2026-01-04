package com.dhruv.taskmanager.dto;

import java.util.List;
import java.util.Map;

public final class AnalyticsDtos {
    private AnalyticsDtos() {}

    public record TrendDto(List<String> labels,
                           List<Long> open,
                           List<Long> inProgress,
                           List<Long> done) {}

    public record UserProductivityDto(String user,
                                      long total,
                                      long done,
                                      long overdue) {}

    public record TaskAnalyticsDto(long total,
                                   long done,
                                   long pending,
                                   long overdue,
                                   double completionRate,
                                   Map<String, Long> distribution,
                                   Map<String, Long> priorities,
                                   TrendDto weekly,
                                   List<UserProductivityDto> byOwner,
                                   List<UserProductivityDto> byAssignee) {}
}