cmake_minimum_required(VERSION 3.25)
cmake_policy(SET CMP0091 NEW)
project(maaverge_native VERSION 0.1.3 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

add_subdirectory("${CMAKE_CURRENT_SOURCE_DIR}/../../3rdparty/nlohmann-json"
  "${CMAKE_CURRENT_BINARY_DIR}/3rdparty/nlohmann-json")
add_subdirectory("${CMAKE_CURRENT_SOURCE_DIR}/../../3rdparty/maaframework"
  "${CMAKE_CURRENT_BINARY_DIR}/3rdparty/maaframework")
find_package(Threads REQUIRED)

add_library(maaverge_native STATIC src/platform.cpp src/framework.cpp)
target_include_directories(maaverge_native PUBLIC src)
target_link_libraries(maaverge_native PUBLIC nlohmann_json::nlohmann_json Threads::Threads ${CMAKE_DL_LIBS}
  PRIVATE maaframework_headers)
target_compile_definitions(maaverge_native PUBLIC NOMINMAX WIN32_LEAN_AND_MEAN)
add_executable(maaverge-native-worker src/main.cpp)
target_link_libraries(maaverge-native-worker PRIVATE maaverge_native)
if(MSVC)
  target_compile_options(maaverge_native PRIVATE /W4 /WX /utf-8)
  target_compile_options(maaverge-native-worker PRIVATE /W4 /WX /utf-8)
else()
  target_compile_options(maaverge_native PRIVATE -Wall -Wextra -Wpedantic -Werror)
  target_compile_options(maaverge-native-worker PRIVATE -Wall -Wextra -Wpedantic -Werror)
  if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
    target_link_options(maaverge-native-worker PRIVATE -static-libstdc++ -static-libgcc)
  endif()
endif()
install(TARGETS maaverge-native-worker RUNTIME DESTINATION .)
install(FILES THIRD_PARTY_NOTICES.md DESTINATION licenses RENAME native-worker-notices.md)
install(FILES "${CMAKE_CURRENT_SOURCE_DIR}/../../3rdparty/maaframework/LICENSE.md"
  DESTINATION licenses RENAME maaframework-LICENSE.md)
install(FILES "${CMAKE_CURRENT_SOURCE_DIR}/../../3rdparty/maaframework/COPYING.GPL3"
  DESTINATION licenses RENAME maaframework-COPYING.GPL3)

include(CTest)
if(BUILD_TESTING)
  find_program(Node_EXECUTABLE NAMES node REQUIRED)
  add_executable(native-lock-probe tests/lock_probe.cpp)
  target_compile_definitions(native-lock-probe PRIVATE NOMINMAX WIN32_LEAN_AND_MEAN)
  if(WIN32)
    add_executable(native-test-launcher tests/test_launcher.cpp)
    target_compile_definitions(native-test-launcher PRIVATE NOMINMAX WIN32_LEAN_AND_MEAN)
    set(native_test_launcher --launcher "$<TARGET_FILE:native-test-launcher>")
  endif()
  foreach(variant normal missing)
    add_library(fake_framework_${variant} SHARED tests/fake_framework.cpp)
    target_link_libraries(fake_framework_${variant} PRIVATE maaframework_headers
      nlohmann_json::nlohmann_json Threads::Threads)
    target_compile_definitions(fake_framework_${variant} PRIVATE MAA_FRAMEWORK_EXPORTS
      NOMINMAX WIN32_LEAN_AND_MEAN _CRT_SECURE_NO_WARNINGS)
    if(variant STREQUAL "missing")
      target_compile_definitions(fake_framework_${variant} PRIVATE OMIT_FRAMEWORK_VERSION=1)
    endif()
    set_target_properties(fake_framework_${variant} PROPERTIES OUTPUT_NAME MaaFramework
      LIBRARY_OUTPUT_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/fixtures/framework-${variant}"
      ARCHIVE_OUTPUT_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/fixtures/framework-${variant}"
      RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/fixtures/framework-${variant}")
    if(MSVC)
      target_compile_options(fake_framework_${variant} PRIVATE /W4 /WX /utf-8)
    else()
      target_compile_options(fake_framework_${variant} PRIVATE -Wall -Wextra -Wpedantic -Werror)
    endif()
  endforeach()
  foreach(suite lease protocol)
    add_test(NAME native.${suite} COMMAND "${Node_EXECUTABLE}"
      "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_protocol.mjs"
      --worker "$<TARGET_FILE:maaverge-native-worker>"
      --framework "$<TARGET_FILE:fake_framework_normal>"
      --lock-probe "$<TARGET_FILE:native-lock-probe>" ${native_test_launcher} --suite ${suite})
    set_tests_properties(native.${suite} PROPERTIES TIMEOUT 45)
  endforeach()
  add_test(NAME native.framework COMMAND "${Node_EXECUTABLE}"
    "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_framework.mjs"
    --worker "$<TARGET_FILE:maaverge-native-worker>"
    --framework "$<TARGET_FILE:fake_framework_normal>"
    --missing "$<TARGET_FILE:fake_framework_missing>" ${native_test_launcher})
  set_tests_properties(native.framework PROPERTIES TIMEOUT 90)
endif()
