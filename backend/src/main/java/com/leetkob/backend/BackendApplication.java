package com.leetkob.backend;

import com.leetkob.backend.judge.JudgeWorkerApplication;
import java.util.Arrays;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/** Entry point for the LeetKOB backend. */
@SpringBootApplication
public class BackendApplication {

  /**
   * Starts the application.
   *
   * @param args command-line arguments
   */
  public static void main(String[] args) {
    if (args.length > 0 && "judge-worker".equals(args[0])) {
      JudgeWorkerApplication.start(Arrays.copyOfRange(args, 1, args.length));
    } else {
      SpringApplication.run(BackendApplication.class, args);
    }
  }
}
