package com.dhruv.taskmanager.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class ViewController {
    @GetMapping("/") public String landing() { return "index"; }
    @GetMapping("/login") public String login() { return "login"; }
    @GetMapping("/signup") public String signup() { return "signup"; }
    @GetMapping("/dashboard") public String dashboard() { return "dashboard"; }
    @GetMapping("/settings") public String settings() { return "settings"; } // optional future
}
