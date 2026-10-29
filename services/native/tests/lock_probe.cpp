// Independent OS-lock holder for the Node-driven interoperability checks.
#include <filesystem>
#include <iostream>
#include <string>
#ifdef _WIN32
#include <windows.h>
#else
#include <fcntl.h>
#include <sys/file.h>
#include <unistd.h>
#endif

#ifdef _WIN32
int wmain(int argc, wchar_t** argv) {
#else
int main(int argc, char** argv) {
#endif
  if (argc != 2) return 2;
  const std::filesystem::path path(argv[1]);
#ifdef _WIN32
  HANDLE file =
      CreateFileW(path.c_str(), GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE,
                  nullptr, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
  if (file == INVALID_HANDLE_VALUE) return 1;
  OVERLAPPED offset{};
  if (!LockFileEx(file, LOCKFILE_EXCLUSIVE_LOCK | LOCKFILE_FAIL_IMMEDIATELY, 0, 1, 0, &offset)) {
    CloseHandle(file);
    return 1;
  }
#else
  const int file = open(path.c_str(), O_RDWR | O_CREAT | O_CLOEXEC, 0600);
  if (file < 0) return 1;
  if (flock(file, LOCK_EX | LOCK_NB) != 0) {
    close(file);
    return 1;
  }
#endif
  std::cout << "locked\n" << std::flush;
  std::string input;
  while (std::getline(std::cin, input)) {
  }
#ifdef _WIN32
  UnlockFileEx(file, 0, 1, 0, &offset);
  CloseHandle(file);
#else
  flock(file, LOCK_UN);
  close(file);
#endif
  // Keep the pathname: removing it would split Unix contenders across inodes.
  return 0;
}
