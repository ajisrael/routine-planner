# Routine Planner - Product Requirements Document

## 1. Overview

### Purpose
A time-blocking planner application for managing family daily routines. The app enables visual organization of recurring tasks across daily, weekly, and monthly calendar views, establishing consistent routines that the family can operate from without having to figure out everything each day.

### Problem Statement
Families juggle numerous recurring tasks across different time scales (daily, weekly, monthly) and often miss things in the process. This app provides a single source of truth for planned routines, eliminating the daily scramble and ensuring nothing falls through the cracks.

### Target Users
- Two adults (primary users)
- Shared calendar with per-person filtering capability

---

## 2. Core Features

### 2.1 Task Management

**Task Definition**
Each task has the following fields:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Name | string | Yes | Short descriptive name |
| Duration | time (15-min increments) | Yes | Estimated time to complete |
| Frequency | recurrence pattern | Yes | How often the task recurs (see Recurrence Patterns) |
| Assignee | user reference | No | Who is responsible for this task |
| Notes | string | No | Optional additional context |
| Category | string | No | For filtering in the task library |

**Task Library**
- Dedicated tab for managing all tasks
- Tasks exist in a pool/library regardless of whether they're scheduled
- Categories for filtering tasks in the library view
- Add, edit, and delete tasks from the library
- Drag-and-drop from library into calendar during planning mode

### 2.2 Calendar Views

**View Types**
- **Daily View**: Single day with detailed time blocks (15-minute granularity)
- **Weekly View**: Full week overview at a glance
- **Monthly View**: Month-level overview of routine patterns
- All three views are equally accessible and primary to the workflow

**Calendar Interactions**
- **Drag to position**: Move tasks to different time slots within a day
- **Drag to resize**: Adjust task duration directly on the calendar
- **Drag from task library**: Schedule unscheduled tasks by dragging from the task library
- **Recurring task placement**: Recurring tasks automatically populate based on frequency pattern

**Conflict Detection**
- Visual warning when two tasks overlap for the same assignee
- Overlapping tasks are allowed (user decides how to resolve)
- Conflict indicator remains visible until resolved

**Filtering**
- Filter calendar view by assignee to see individual routines
- Clear visual distinction between tasks assigned to different people

### 2.3 Recurrence Patterns

Each task supports flexible recurrence configuration:

- **Specific Days of Week**: e.g., Monday, Wednesday, Friday
- **Interval-Based**: e.g., every 2 weeks, every 3 days
- **Monthly Patterns**: e.g., 1st Monday of each month, every 15th
- **Custom Patterns**: Combination rules as needed
- Each task can have its own unique frequency

### 2.4 Real-Time Collaboration

**Multi-Device Sync**
- Two users working simultaneously from different devices
- Changes appear in real-time without manual page refresh
- No conflicts or lost work when both users edit concurrently

**Implementation**
- WebSocket connection for live updates
- Fallback to polling if WebSocket unavailable
- Last-write-wins conflict handling for simultaneous edits

---

## 3. Non-Functional Requirements

### 3.1 Responsive Design
- Must work well on both desktop and mobile devices
- Touch-friendly interactions on mobile (drag-and-drop with touch support)
- Adaptive layout that reflows appropriately for screen size

### 3.2 Data Persistence
- SQLite database for all data storage
- Planned routines persist beyond UI session
- No requirement for history or analytics (current + future only)

### 3.3 Performance
- Calendar renders within 1 second
- Drag-and-drop interactions feel instant (< 100ms feedback)
- Real-time updates propagate within 2 seconds

### 3.4 Simplicity
- Minimal fields per task - keep the interface uncluttered
- No notifications or reminders required
- No templates for initial release (address as future enhancement)
- Users login by entering a name (no account/password authentication)
- App runs only on local network (self-hosted), so security model can be lightweight

### 3.5 Time Horizon
- Calendar supports planning up to 1 month (30 days) ahead
- Tasks/recurrences beyond the 30-day window are not displayed or generated

---

## 4. User Workflows

### 4.1 Creating a Task
1. Navigate to Task Library tab
2. Click "Add Task"
3. Enter name, duration, frequency, optional notes/category
4. Optionally assign to a family member
5. Task appears in the library ready to be scheduled

### 4.2 Planning a Routine (Weekly Planning Session)
1. Navigate to Calendar tab, select Weekly view
2. Open Task Library sidebar/panel
3. Filter tasks by category if desired
4. Drag unscheduled tasks into time slots on the calendar
5. Resize tasks by dragging edges to adjust duration
6. Move tasks between time slots as needed
7. Review for conflicts (warning indicators shown)
8. Adjust assignments or timing to resolve conflicts
9. Save routine (auto-persist to database)

### 4.3 Viewing Individual Routines
1. Navigate to Calendar tab
2. Apply assignee filter (e.g., "Mom's Routine" or "Dad's Routine")
3. View only that person's scheduled tasks across daily/weekly/monthly views
4. Verify no time conflicts for that individual

### 4.4 Adjusting a Routine
1. Navigate to Calendar tab
2. Drag tasks to new time slots
3. Resize tasks to adjust duration
4. Remove tasks from calendar (returns to unscheduled library)
5. Changes auto-persist and sync to other device in real-time

---

## 5. Data Model (Preliminary)

### Entities

**User**
- id (primary key)
- name
- display_name

**Task**
- id (primary key)
- name
- duration_minutes (integer, 15-min increments)
- notes (optional)
- category (optional)
- user_id (foreign key, nullable - for assignee)

**RecurrenceRule**
- id (primary key)
- task_id (foreign key)
- rule_type (enum: specific_days, interval, monthly_pattern)
- specific_days (JSON: ["monday", "wednesday", "friday"])
- interval_days (integer, for interval type)
- monthly_pattern (JSON, for monthly type)
- start_date
- end_date (optional)

**ScheduledTask**
- id (primary key)
- task_id (foreign key)
- recurrence_rule_id (foreign key)
- scheduled_date (date)
- start_time (time)
- end_time (time)
- user_id (foreign key, for assignment override)

**Category**
- id (primary key)
- name
- color (optional, for visual distinction)

---

## 6. Technology Stack (Proposed)

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | React + TypeScript | Component-based, strong typing, large ecosystem |
| UI Components | Tailwind CSS + dnd-kit | Rapid styling, accessible drag-and-drop |
| Calendar | Custom or react-big-calendar | Flexible calendar rendering |
| Backend | Node.js + Express | Simple API server |
| Database | SQLite via better-sqlite3 | Lightweight, no server needed |
| Real-Time | Socket.IO | WebSocket abstraction with fallback |
| State Management | Zustand or React Query | Lightweight, good for real-time updates |

---

## 7. Deployment & Operational Decisions

1. **Authentication**: Users enter a name to login. No accounts or passwords.
2. **Conflict Resolution**: Last-write-wins for simultaneous edits.
3. **Deployment**: Self-hosted on a Proxmox VM on the local network (handled outside this build).
4. **Time Horizon**: Calendar displays up to 1 month (30 days) ahead.
5. **History**: Not needed. Only current and future routines are stored.
