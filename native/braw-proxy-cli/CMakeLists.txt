# Headless BRAW → H.264 MP4 proxy CLI (Blackmagic RAW SDK + FFmpeg).
# Build on Ubuntu 24.04 x86_64 with the Linux BRAW SDK installed (headers + libs).
cmake_minimum_required(VERSION 3.16)
project(braw-proxy-cli LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

# Linux SDK layout (RPM/official): BRAW_SDK_ROOT/Include/BlackmagicRawAPI.h and
# BRAW_SDK_ROOT/Libraries/libBlackmagicRawAPI.so (e.g. .../BlackmagicRAWSDK/Linux).
# Older/custom trees with headers/libs at the root still work via PATH_SUFFIXES fallbacks.
set(BRAW_SDK_ROOT "/opt/braw-sdk/BlackmagicRawAPI" CACHE PATH
  "Blackmagic RAW SDK Linux root: Include/ + Libraries/ (see README)")

find_path(
  BRAW_SDK_INCLUDE_DIR
  NAMES BlackmagicRawAPI.h
  HINTS "${BRAW_SDK_ROOT}"
  PATH_SUFFIXES Include include ""
  NO_DEFAULT_PATH
)
if(NOT BRAW_SDK_INCLUDE_DIR)
  message(FATAL_ERROR
    "BlackmagicRawAPI.h not found under ${BRAW_SDK_ROOT}. "
    "Expected ${BRAW_SDK_ROOT}/Include/BlackmagicRawAPI.h (Linux SDK). Set -DBRAW_SDK_ROOT=...")
endif()

find_library(
  BRAW_SDK_LIBRARY
  NAMES BlackmagicRawAPI
  HINTS "${BRAW_SDK_ROOT}"
  PATH_SUFFIXES Libraries lib ""
  NO_DEFAULT_PATH
)
if(NOT BRAW_SDK_LIBRARY)
  message(FATAL_ERROR
    "libBlackmagicRawAPI not found under ${BRAW_SDK_ROOT}. "
    "Expected ${BRAW_SDK_ROOT}/Libraries/libBlackmagicRawAPI.so (Linux SDK). Set -DBRAW_SDK_ROOT=...")
endif()

add_executable(braw-proxy-cli
  src/main.cpp
  src/bmd_decode.cpp
)
target_include_directories(braw-proxy-cli PRIVATE "${BRAW_SDK_INCLUDE_DIR}")
target_link_libraries(braw-proxy-cli PRIVATE "${BRAW_SDK_LIBRARY}")

# Runtime: loaders resolve Blackmagic RAW deps from the canonical install on the worker.
# Build may use an RPM extract path for BRAW_SDK_ROOT; installed binaries still load from /opt.
set_target_properties(braw-proxy-cli PROPERTIES
  BUILD_RPATH "/opt/braw-sdk/BlackmagicRawAPI"
  INSTALL_RPATH "/opt/braw-sdk/BlackmagicRawAPI"
  SKIP_BUILD_RPATH FALSE
)

install(TARGETS braw-proxy-cli RUNTIME DESTINATION bin)
