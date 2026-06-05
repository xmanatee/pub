import { describe, expect, it } from "vitest";
import {
  calendarToday,
  gmailUnread,
  newsHn,
  parseCalendarTodayResult,
  parseGmailUnreadResult,
  parseNewsHnResult,
  parseWeatherResult,
  weatherCurrent,
} from "./commands";

describe("briefing command result parsers", () => {
  it("runs shell commands with strict pipeline failure handling", () => {
    for (const command of [weatherCurrent, calendarToday, gmailUnread, newsHn]) {
      expect(command.executor?.kind).toBe("shell");
      if (command.executor?.kind !== "shell") throw new Error(`${command.name} must use shell`);
      expect(command.executor.shell).toBe("/bin/bash");
      expect(command.executor.script).toMatch(/^set -euo pipefail; /);
    }
  });

  it("parses weather command output", () => {
    expect(
      parseWeatherResult({
        location: "London, City of London",
        temperatureC: 12,
        feelsLikeC: 10,
        description: "Partly cloudy",
        humidity: 70,
        windKph: 8,
        hourly: [
          { time: "900", temperatureC: 12, description: "Cloudy", chanceOfRain: 20 },
          { time: "1200", temperatureC: 14, description: "Sunny", chanceOfRain: 0 },
        ],
        forecast: [
          { date: "2026-06-04", minC: 9, maxC: 15, description: "Cloudy" },
          { date: "2026-06-05", minC: 11, maxC: 16, description: "Rain" },
        ],
      }),
    ).toEqual({
      location: "London, City of London",
      temperatureC: 12,
      feelsLikeC: 10,
      description: "Partly cloudy",
      humidity: 70,
      windKph: 8,
      hourly: [
        { time: "900", temperatureC: 12, description: "Cloudy", chanceOfRain: 20 },
        { time: "1200", temperatureC: 14, description: "Sunny", chanceOfRain: 0 },
      ],
      forecast: [
        { date: "2026-06-04", minC: 9, maxC: 15, description: "Cloudy" },
        { date: "2026-06-05", minC: 11, maxC: 16, description: "Rain" },
      ],
    });
  });

  it("rejects weather output without hourly data", () => {
    expect(() =>
      parseWeatherResult({
        location: "London, City of London",
        temperatureC: 12,
        feelsLikeC: 10,
        description: "Partly cloudy",
        humidity: 70,
        windKph: 8,
        forecast: [{ date: "2026-06-04", minC: 9, maxC: 15, description: "Cloudy" }],
      }),
    ).toThrow("briefing.weather.hourly must be an array");
  });

  it("parses calendar, gmail, and news command output", () => {
    expect(
      parseCalendarTodayResult({
        events: [
          {
            id: "event-1",
            summary: "Planning",
            start: "2026-06-04T09:00:00Z",
            end: "2026-06-04T10:00:00Z",
            location: null,
            link: "https://calendar.google.com/event?eid=event-1",
          },
        ],
      }),
    ).toEqual({
      events: [
        {
          id: "event-1",
          summary: "Planning",
          start: "2026-06-04T09:00:00Z",
          end: "2026-06-04T10:00:00Z",
          location: null,
          link: "https://calendar.google.com/event?eid=event-1",
        },
      ],
    });

    expect(
      parseGmailUnreadResult({
        messages: [
          {
            id: "msg-1",
            threadId: "thread-1",
            from: "Ada",
            subject: "Review",
            date: "Thu, 04 Jun 2026 09:00:00 +0000",
            snippet: "Please review this.",
            unread: true,
            labels: ["INBOX", "UNREAD"],
          },
        ],
      }),
    ).toEqual({
      messages: [
        {
          id: "msg-1",
          threadId: "thread-1",
          from: "Ada",
          subject: "Review",
          date: "Thu, 04 Jun 2026 09:00:00 +0000",
          snippet: "Please review this.",
          unread: true,
          labels: ["INBOX", "UNREAD"],
        },
      ],
    });

    expect(
      parseNewsHnResult({
        stories: [
          {
            id: 1,
            title: "A story",
            url: null,
            score: 42,
            by: "submitter",
            comments: 7,
            time: 1_780_000_000,
          },
        ],
      }),
    ).toEqual({
      stories: [
        {
          id: 1,
          title: "A story",
          url: null,
          score: 42,
          by: "submitter",
          comments: 7,
          time: 1_780_000_000,
        },
      ],
    });
  });
});
