// Node supplies CRT descriptor metadata on Windows. A fresh Win32 launch keeps
// independently linked /MT test DLLs from restoring stale stdout descriptors.
#include <iostream>
#include <string>
#include <windows.h>

namespace {
std::wstring quote(const wchar_t* argument) {
  std::wstring result = L"\"";
  std::size_t slashes = 0;
  for (const wchar_t* current = argument; *current; ++current) {
    if (*current == L'\\') {
      ++slashes;
      continue;
    }
    result.append(slashes * (*current == L'\"' ? 2 : 1), L'\\');
    if (*current == L'\"') result += L'\\';
    result += *current;
    slashes = 0;
  }
  result.append(slashes * 2, L'\\');
  return result + L'\"';
}
}  // namespace

int wmain(int argc, wchar_t** argv) {
  if (argc < 2) return 2;
  HANDLE job = CreateJobObjectW(nullptr, nullptr);
  if (!job) return 1;
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
  limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
  if (!SetInformationJobObject(job, JobObjectExtendedLimitInformation, &limits, sizeof(limits))) {
    CloseHandle(job);
    return 1;
  }

  STARTUPINFOW startup{};
  startup.cb = sizeof(startup);
  startup.dwFlags = STARTF_USESTDHANDLES;
  startup.hStdInput = GetStdHandle(STD_INPUT_HANDLE);
  startup.hStdOutput = GetStdHandle(STD_OUTPUT_HANDLE);
  startup.hStdError = GetStdHandle(STD_ERROR_HANDLE);
  for (const HANDLE handle : {startup.hStdInput, startup.hStdOutput, startup.hStdError}) {
    if (!SetHandleInformation(handle, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT)) {
      CloseHandle(job);
      return 1;
    }
  }
  std::wstring command;
  for (int index = 1; index < argc; ++index) {
    if (index > 1) command += L' ';
    command += quote(argv[index]);
  }
  PROCESS_INFORMATION child{};
  if (!CreateProcessW(argv[1], command.data(), nullptr, nullptr, TRUE,
                      CREATE_SUSPENDED | CREATE_NO_WINDOW, nullptr, nullptr, &startup, &child)) {
    std::cerr << "synthetic launch failed: " << GetLastError() << '\n';
    CloseHandle(job);
    return 1;
  }
  if (!AssignProcessToJobObject(job, child.hProcess) || ResumeThread(child.hThread) == DWORD(-1)) {
    TerminateProcess(child.hProcess, 1);
    CloseHandle(child.hThread);
    CloseHandle(child.hProcess);
    CloseHandle(job);
    return 1;
  }
  CloseHandle(child.hThread);
  WaitForSingleObject(child.hProcess, INFINITE);
  DWORD code = 1;
  GetExitCodeProcess(child.hProcess, &code);
  CloseHandle(child.hProcess);
  CloseHandle(job);
  return static_cast<int>(code);
}
