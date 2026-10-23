"""Public JSON-RPC data models. Camel-case names match the UI contract."""

from typing import Any, Literal, get_args

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", json_schema_serialization_defaults_required=True)


TaskType = Literal[
    "StartUp",
    "CloseDown",
    "Fight",
    "Recruit",
    "Infrast",
    "Mall",
    "Award",
    "SwitchTheme",
    "Roguelike",
    "Copilot",
    "SSSCopilot",
    "ParadoxCopilot",
    "Depot",
    "OperBox",
    "Reclamation",
    "Custom",
    "SingleStep",
    "VideoRecognition",
    "OperProgress",
]
TASK_TYPES = set(get_args(TaskType))


class Task(StrictModel):
    type: TaskType
    params: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class Budgets(StrictModel):
    originium: int = Field(default=0, ge=0, le=100)
    medicine: int = Field(default=0, ge=0, le=100)
    expedited: int = Field(default=0, ge=0, le=100)


class Plan(StrictModel):
    id: str = ""
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=500)
    deviceId: str | None = Field(default=None, min_length=1, max_length=200)
    group: Literal["daily", "specialized"] = "daily"
    budgets: Budgets | None = None
    tasks: list[Task] = Field(min_length=1, max_length=30)
    schedule: str | None = None
    enabled: bool = True


class ModelSettings(StrictModel):
    provider: str = "none"
    baseUrl: str = ""
    model: str = ""


class Settings(StrictModel):
    autoConnect: bool = True
    autoUpdateCore: bool = True
    autoUpdateResource: bool = True
    minimizeToTray: bool = True
    rememberCloseAction: bool = False
    # Retained for settings/database parity; log maintenance belongs to the Bun service.
    logRetentionDays: Literal[0, 7, 14, 30] = 7
    theme: Literal["dark", "light", "system"] = "system"
    budgets: Budgets = Field(default_factory=Budgets)
    model: ModelSettings = Field(default_factory=ModelSettings)


class Event(StrictModel):
    id: int
    type: str
    message: str
    createdAt: str
    data: dict[str, Any] = Field(default_factory=dict)


class Device(StrictModel):
    id: str
    name: str
    address: str
    state: Literal["idle", "running", "offline"]
    coreVersion: str | None = None
    resourceVersion: str | None = None


class Run(StrictModel):
    id: str
    planId: str
    deviceId: str
    status: Literal["running", "completed", "failed", "stopped"]
    progress: int = Field(ge=0, le=100)
    message: str
    startedAt: str
    finishedAt: str | None = None


class UpdateChannel(StrictModel):
    id: Literal["app", "core", "resource"]
    currentVersion: str
    latestVersion: str | None = None
    status: Literal[
        "idle", "checking", "available", "downloading", "staged", "waiting_idle", "active", "failed"
    ] = "idle"
    progress: int = Field(default=0, ge=0, le=100)
    message: str = ""


class Snapshot(StrictModel):
    mode: Literal["mock", "native"]
    devices: list[Device]
    plans: list[Plan]
    runs: list[Run]
    updates: list[UpdateChannel]
    settings: Settings
    events: list[Event]


class RpcError(Exception):
    def __init__(self, code: int, message: str, data: Any = None):
        super().__init__(message)
        self.code, self.message, self.data = code, message, data

    def as_dict(self) -> dict[str, Any]:
        value = {"code": self.code, "message": self.message}
        if self.data is not None:
            value["data"] = self.data
        return value
