package com.leetkob.backend.judge;

import static org.assertj.core.api.Assertions.assertThat;

import com.leetkob.backend.judge.DockerSandbox.Outcome;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/** Submission probes for all nine sandbox minimums. Runs in the sandbox CI job. */
@EnabledIfEnvironmentVariable(named = "JUDGE_SANDBOX_TESTS", matches = "1")
class DockerSandboxTest {

  private final DockerSandbox sandbox = new DockerSandbox(DockerSandbox.DEFAULT_IMAGE);

  @Test
  void submissionHasOnlyLoopbackAndCannotConnectOrResolveExternally() {
    var result =
        run(
            """
            #include <arpa/inet.h>
            #include <ifaddrs.h>
            #include <net/if.h>
            #include <netdb.h>
            #include <sys/socket.h>
            #include <unistd.h>
            int main() {
              struct ifaddrs *interfaces = nullptr;
              if (getifaddrs(&interfaces) != 0) return 1;
              bool loopbackOnly = true;
              for (auto entry = interfaces; entry != nullptr; entry = entry->ifa_next)
                if (!(entry->ifa_flags & IFF_LOOPBACK)) loopbackOnly = false;
              freeifaddrs(interfaces);
              if (!loopbackOnly) return 2;

              const int fd = socket(AF_INET, SOCK_STREAM, 0);
              if (fd < 0) return 3;
              sockaddr_in address{};
              address.sin_family = AF_INET;
              address.sin_port = htons(53);
              if (inet_pton(AF_INET, "1.1.1.1", &address.sin_addr) != 1) return 4;
              const int connected = connect(
                  fd, reinterpret_cast<const sockaddr*>(&address), sizeof(address));
              close(fd);

              addrinfo hints{};
              hints.ai_family = AF_INET;
              hints.ai_socktype = SOCK_STREAM;
              addrinfo* resolved = nullptr;
              const int lookedUp = getaddrinfo("example.com", nullptr, &hints, &resolved);
              if (lookedUp == 0) freeaddrinfo(resolved);
              return connected == -1 && lookedUp != 0 ? 0 : 5;
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
  void memoryCapKillsAllocationAfterTheSubmissionReadsPagesBack() {
    var result =
        run(
            """
            #include <fstream>
            #include <iostream>
            #include <string>
            #include <sys/mman.h>
            #include <unistd.h>
            int main() {
              std::string memoryLimit, swap;
              std::ifstream("/sys/fs/cgroup/memory.max") >> memoryLimit;
              std::ifstream("/sys/fs/cgroup/memory.swap.max") >> swap;
              if (memoryLimit != "67108864" || swap != "0") return 2;
              std::cout << "memory=67108864 swap=0" << std::endl;
              const size_t length = 80 * 1024 * 1024;
              const size_t block = 8 * 1024 * 1024;
              const long page = sysconf(_SC_PAGESIZE);
              if (page <= 0 || block % page != 0) return 3;
              auto memory = (volatile char*)mmap(nullptr, length, PROT_READ | PROT_WRITE,
                                                MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
              if (memory == MAP_FAILED) return 4;
              volatile size_t sum = 0;
              for (size_t start = 0; start < length; start += block) {
                for (size_t i = start; i < start + block; i += page) memory[i] = 1;
                for (size_t i = start; i < start + block; i += page) sum = sum + memory[i];
                if (sum != (start + block) / page) return 5;
                if (start == 0) std::cout << "readback_sum=" << sum << std::endl;
              }
            }
            """);

    String output = new String(result.stdout(), StandardCharsets.UTF_8);
    assertThat(output).contains("memory=67108864 swap=0");
    assertThat(output).containsPattern("readback_sum=[1-9][0-9]*");
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
              return denied && threads.size() < 16 ? 0 : 1;
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

  @Test
  void submissionCannotFindSecretFilesOrKeyMarkers() {
    var result =
        run(
            """
            #include <array>
            #include <filesystem>
            #include <fstream>
            #include <string_view>

            namespace fs = std::filesystem;

            bool exposesSecret(const fs::path& path) {
              std::ifstream file(path, std::ios::binary);
              if (!file) return false;
              const auto name = path.filename().string();
              if (name == ".env" || name.rfind(".env.", 0) == 0
                  || name.find("API_KEY") != name.npos || name.find("GEMINI") != name.npos
                  || path.string().rfind("/run/secrets/", 0) == 0) return true;
              std::array<char, 65536> buffer;
              file.read(buffer.data(), buffer.size());
              const std::string_view content(buffer.data(), file.gcount());
              return content.find("API_KEY") != content.npos || content.find("GEMINI") != content.npos;
            }

            int main() {
              if (exposesSecret("/.env")) return 1;
              for (const auto* root : {"/work", "/run", "/tmp", "/var/tmp", "/home", "/root",
                                       "/app", "/opt", "/workspace", "/mnt", "/etc",
                                       "/usr/local/lib/leetkob"}) {
                std::error_code error;
                const auto options = fs::directory_options::skip_permission_denied;
                for (fs::recursive_directory_iterator file(root, options, error), end;
                     file != end; file.increment(error)) {
                  const auto& path = file->path();
                  if (path == "/work/program") continue;
                  if (fs::is_regular_file(file->status(error)) && exposesSecret(path))
                    return 2;
                }
              }
            }
            """);

    assertThat(result.outcome()).isEqualTo(Outcome.OK);
  }

  @Test
  void compilerCannotIncludeEnvironmentOrSecretFiles() {
    var compiled =
        sandbox.compile(
            """
            #if __has_include(".env") || __has_include("/.env") || __has_include("/work/.env")
            #error An environment file is visible to the compiler
            #endif
            #if __has_include("/app/.env") || __has_include("/workspace/.env")
            #error A service environment file is visible to the compiler
            #endif
            #if __has_include("/run/secrets") || __has_include("/run/secrets/GEMINI_API_KEY")
            #error A service secret is visible to the compiler
            #endif
            int main() {}
            """);

    assertThat(compiled.outcome()).isEqualTo(Outcome.OK);
  }

  private DockerSandbox.Execution run(String source) {
    var compiled = sandbox.compile(source);
    assertThat(compiled.outcome()).isEqualTo(Outcome.OK);
    return sandbox.run(compiled.stdout(), "", 1000, 64);
  }
}
