package com.leetkob.backend.judge;

import static org.assertj.core.api.Assertions.assertThat;

import com.leetkob.backend.judge.DockerSandbox.Outcome;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/** One submission per sandbox minimum. Runs in the sandbox CI job. */
@EnabledIfEnvironmentVariable(named = "JUDGE_SANDBOX_TESTS", matches = "1")
class DockerSandboxTest {

  private final DockerSandbox sandbox = new DockerSandbox(DockerSandbox.DEFAULT_IMAGE);

  @Test
  void networkInterfacesAreLimitedToLoopback() {
    var result =
        run(
            """
            #include <ifaddrs.h>
            #include <net/if.h>
            int main() {
              struct ifaddrs *interfaces = nullptr;
              if (getifaddrs(&interfaces) != 0) return 1;
              for (auto entry = interfaces; entry != nullptr; entry = entry->ifa_next)
                if (!(entry->ifa_flags & IFF_LOOPBACK)) return 2;
              freeifaddrs(interfaces);
            }
            """);
    assertThat(result.outcome()).isEqualTo(Outcome.OK);
  }

  @Test
  void busySubmissionHitsCpuBudgetBeforeWallTime() {
    var result =
        run(
            """
            int main() {
              volatile unsigned counter = 0;
              while (true) counter = counter + 1;
            }
            """);
    assertThat(result.outcome()).isEqualTo(Outcome.CPU);
  }

  @Test
  void waitingSubmissionHitsWallLimitAndLeavesNoContainer() throws Exception {
    var result =
        run(
            """
            #include <unistd.h>
            int main() { sleep(15); }
            """);

    assertThat(result.outcome()).isEqualTo(Outcome.WALL);
    var inspection = new ProcessBuilder("docker", "inspect", result.containerName()).start();
    assertThat(inspection.waitFor()).isNotZero();
  }

  @Test
  void memoryCapKillsAllocationAndSwapLimitIsReadable() {
    var result =
        run(
            """
            #include <fstream>
            #include <iostream>
            #include <string>
            #include <sys/mman.h>
            int main() {
              std::string memoryLimit, swap;
              std::ifstream("/sys/fs/cgroup/memory.max") >> memoryLimit;
              std::ifstream("/sys/fs/cgroup/memory.swap.max") >> swap;
              if (memoryLimit != "67108864" || swap != "0") return 2;
              std::cout << "memory=67108864 swap=0" << std::endl;
              const size_t length = 80 * 1024 * 1024;
              auto memory = (volatile char*)mmap(nullptr, length, PROT_READ | PROT_WRITE,
                                                MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
              if (memory == MAP_FAILED) return 3;
              for (size_t i = 0; i < length; i += 4096) memory[i] = 1;
            }
            """);

    String output = new String(result.stdout(), StandardCharsets.UTF_8);
    assertThat(output).contains("memory=67108864 swap=0");
    assertThat(result.outcome()).isEqualTo(Outcome.MEMORY);
  }

  @Test
  void creatingMoreThanSixteenTasksIsDenied() {
    var result =
        run(
            """
            #include <thread>
            #include <vector>
            #include <chrono>
            #include <system_error>
            int main() {
              std::vector<std::thread> threads;
              bool denied = false;
              try {
                for (int i = 0; i < 20; ++i)
                  threads.emplace_back([] { std::this_thread::sleep_for(std::chrono::milliseconds(600)); });
              } catch (const std::system_error&) {
                denied = true;
              }
              for (auto& thread : threads) thread.join();
              return denied && threads.size() == 14 ? 0 : 1;
            }
            """);
    assertThat(result.outcome()).isEqualTo(Outcome.OK);
  }

  @Test
  void outputOverOneMebibyteEndsExecution() {
    var result =
        run(
            """
            #include <iostream>
            #include <string>
            int main() {
              const std::string block(1024, 'a');
              for (int i = 0; i < 513; ++i) {
                std::cout << block;
                std::cerr << block;
              }
            }
            """);
    assertThat(result.outcome()).isEqualTo(Outcome.OUTPUT);
  }

  @Test
  void nonRootSubmissionRunsUnderAnIsolatedSupervisor() {
    var result =
        run(
            """
            #include <fstream>
            #include <string>
            #include <unistd.h>
            int main() {
              if (getuid() == 0 || geteuid() == 0 || setuid(0) != -1) return 1;
              std::ifstream status("/proc/1/status");
              for (std::string line; std::getline(status, line);)
                if (line.rfind("SigIgn:", 0) == 0)
                  return (std::stoull(line.substr(7), nullptr, 16) & 2) ? 0 : 2;
              return 3;
            }
            """);
    assertThat(result.outcome()).isEqualTo(Outcome.OK);
  }

  @Test
  void hostWorkspaceAndDockerSocketAreNotMounted() {
    var result =
        run(
            """
            #include <unistd.h>
            int main() {
              return access("/var/run/docker.sock", F_OK) == -1
                  && access("/host", F_OK) == -1 && access("/workspace", F_OK) == -1 ? 0 : 1;
            }
            """);
    assertThat(result.outcome()).isEqualTo(Outcome.OK);
  }

  @Test
  void submissionCannotReadServiceEnvironment() {
    var result =
        run(
            """
            extern char** environ;
            int main() { return environ[0] == nullptr ? 0 : 1; }
            """);
    assertThat(result.outcome()).isEqualTo(Outcome.OK);
  }

  private DockerSandbox.Execution run(String source) {
    var compiled = sandbox.compile(source);
    assertThat(compiled.outcome()).isEqualTo(Outcome.OK);
    return sandbox.run(compiled.stdout(), "", 1000, 64);
  }
}
