package com.dhruv.taskmanager.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class ViewController {
    @GetMapping("/")
    public String dashboard() {
        return "dashboard"; // resolves src/main/resources/templates/dashboard.html
    }
}
