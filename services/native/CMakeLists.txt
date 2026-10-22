cmake_minimum_required(VERSION 3.25)
cmake_policy(SET CMP0091 NEW)
project(maaverge_native VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

add_subdirectory("${CMAKE_CURRENT_SOURCE_DIR}/../../3rdparty/nlohmann-json"
  "${CMAKE_CURRENT_BINARY_DIR}/3rdparty/nlohmann-json")
find_package(Threads REQUIRED)

add_library(maaverge_native STATIC src/platform.cpp src/core.cpp)
target_include_directories(maaverge_native PUBLIC src)
target_link_libraries(maaverge_native PUBLIC nlohmann_json::nlohmann_json Threads::Threads ${CMAKE_DL_LIBS})
target_compile_definitions(maaverge_native PUBLIC NOMINMAX WIN32_LEAN_AND_MEAN)
add_executable(maaverge-core-worker src/main.cpp)
target_link_libraries(maaverge-core-worker PRIVATE maaverge_native)
if(MSVC)
  target_compile_options(maaverge_native PRIVATE /W4 /WX /utf-8)
  target_compile_options(maaverge-core-worker PRIVATE /W4 /WX /utf-8)
else()
  target_compile_options(maaverge_native PRIVATE -Wall -Wextra -Wpedantic -Werror)
  target_compile_options(maaverge-core-worker PRIVATE -Wall -Wextra -Wpedantic -Werror)
  if(CMAKE_SYSTEM_NAME STREQUAL "Linux")
    target_link_options(maaverge-core-worker PRIVATE -static-libstdc++ -static-libgcc)
  endif()
endif()
install(TARGETS maaverge-core-worker RUNTIME DESTINATION .)
install(FILES THIRD_PARTY_NOTICES.md DESTINATION licenses RENAME native-worker-notices.md)

include(CTest)
if(BUILD_TESTING)
  find_package(Python3 3.12 REQUIRED COMPONENTS Interpreter)
  foreach(variant normal missing legacy)
    add_library(fake_core_${variant} SHARED tests/fake_core.cpp)
    target_include_directories(fake_core_${variant} PRIVATE src)
    target_link_libraries(fake_core_${variant} PRIVATE nlohmann_json::nlohmann_json Threads::Threads)
    target_compile_definitions(fake_core_${variant} PRIVATE NOMINMAX WIN32_LEAN_AND_MEAN _CRT_SECURE_NO_WARNINGS)
    if(variant STREQUAL "missing")
      target_compile_definitions(fake_core_${variant} PRIVATE OMIT_RUNNING=1)
    elseif(variant STREQUAL "legacy")
      target_compile_definitions(fake_core_${variant} PRIVATE OMIT_PREVIEW=1)
    endif()
    set_target_properties(fake_core_${variant} PROPERTIES OUTPUT_NAME MaaCore
      LIBRARY_OUTPUT_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/fixtures/${variant}"
      ARCHIVE_OUTPUT_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/fixtures/${variant}"
      RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}/fixtures/${variant}")
    if(MSVC)
      target_compile_options(fake_core_${variant} PRIVATE /W4 /WX /utf-8)
    else()
      target_compile_options(fake_core_${variant} PRIVATE -Wall -Wextra -Wpedantic -Werror)
    endif()
  endforeach()
  foreach(suite validation worker lease protocol)
    add_test(NAME native.${suite} COMMAND "${Python3_EXECUTABLE}"
      "${CMAKE_CURRENT_SOURCE_DIR}/tests/test_protocol.py"
      --worker "$<TARGET_FILE:maaverge-core-worker>"
      --core "$<TARGET_FILE:fake_core_normal>"
      --missing "$<TARGET_FILE:fake_core_missing>"
      --legacy "$<TARGET_FILE:fake_core_legacy>" --suite ${suite})
    set_tests_properties(native.${suite} PROPERTIES TIMEOUT 45)
  endforeach()
endif()
