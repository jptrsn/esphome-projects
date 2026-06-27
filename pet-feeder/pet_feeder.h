#pragma once
#include <array>
#include <cstdint>
#include <cstring>

// Schedule cache for the MCU's confirmed meal_plan (dp1).
//
// Why dp1 needs caching: dp1 is a RAW-type Tuya datapoint. Per the Tuya serial
// spec, raw DPs are not cached by the module and are NOT re-reported on a 0x08
// status query -- the MCU only emits dp1 via a 0x07 report when it changes
// (including the echo right after we write it). With the WBR3 removed there is
// no cloud shadow either. So the ESP holds the last MCU-confirmed schedule,
// seeded ONLY from the 0x07 echo (confirmed-executed state) and persisted to
// NVS so it survives reboots.
//
// Why the backing store is a std::array<uint8_t,52> and not this struct:
// ESPHome's code generator emits `esphome: includes:` AFTER the globals block
// in main.cpp (esphome/issues#5221), so a global declared `type: ScheduleCache`
// fails -- the type is undefined at that line. A std::array needs no user
// header, so it always compiles. We therefore store raw bytes in the global and
// overlay this struct on them inside lambdas (which appear after the include).
//
// Byte layout of the 52-byte array:
//   [0]      valid : 0 = nothing ever confirmed (UNKNOWN, UI shows so); 1 = holds a schedule
//   [1]      len   : number of valid dp1 bytes in data (0-50)
//   [2..51]  data  : raw dp1 bytes, per meal [days,hour,min,portions,enable]
struct ScheduleCache {
  uint8_t valid;
  uint8_t len;
  uint8_t data[50];
};
static_assert(sizeof(ScheduleCache) == 52, "ScheduleCache must be 52 bytes to overlay the global array");

// Overlay the ScheduleCache view onto the global's raw 52-byte array.
// Usage in a lambda:  auto &c = sched_cache(id(schedule_cache));
inline ScheduleCache &sched_cache(std::array<uint8_t, 52> &raw) {
  return *reinterpret_cast<ScheduleCache *>(raw.data());
}
