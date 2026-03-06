from __future__ import annotations

from enum import Enum
import re
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# ---------------------------------------------------------------------------
# Core SSE types
# ---------------------------------------------------------------------------


class SSEEvent(BaseModel):
    model_config = ConfigDict(frozen=True)

    event: str
    data: str
    id: str | None = None
    retry: int | None = None


class RequestInfo(BaseModel):
    model_config = ConfigDict(frozen=True)

    url: str
    method: str
    headers: dict[str, str]
    body: str | None = None
    client_ip: str | None = None
    user_agent: str | None = None


# ---------------------------------------------------------------------------
# Session types
# ---------------------------------------------------------------------------


class SessionStatus(str, Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    ERROR = "error"


class EventAction(str, Enum):
    FORWARD = "forward"
    EDIT = "edit"
    DROP = "drop"
    INJECT = "inject"
    DELAY = "delay"


class HistoryEntry(BaseModel):
    model_config = ConfigDict(frozen=True)

    index: int
    timestamp: float
    original_event: SSEEvent | None
    action: EventAction
    sent_event: SSEEvent | None
    delay_ms: int = 0


class SessionInfo(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    request: RequestInfo
    client_ip: str | None = None
    user_agent: str | None = None
    status: SessionStatus
    created_at: float
    event_count: int
    pending_count: int


# ---------------------------------------------------------------------------
# Pipeline step types (discriminated union on `action`)
# ---------------------------------------------------------------------------


class PassthroughStep(BaseModel):
    model_config = ConfigDict(frozen=True)

    action: Literal["passthrough"]
    match_event: str | None = None
    comment: str | None = None


class PassthroughRestStep(BaseModel):
    model_config = ConfigDict(frozen=True)

    action: Literal["passthrough_rest"]
    comment: str | None = None


class MockStep(BaseModel):
    model_config = ConfigDict(frozen=True)

    action: Literal["mock"]
    event: str
    data: str
    comment: str | None = None


class DelayStep(BaseModel):
    model_config = ConfigDict(frozen=True)

    action: Literal["delay"]
    delay_ms: Annotated[int, Field(gt=0)]
    comment: str | None = None


class DropStep(BaseModel):
    model_config = ConfigDict(frozen=True)

    action: Literal["drop"]
    match_event: str | None = None
    comment: str | None = None


class DropRestStep(BaseModel):
    model_config = ConfigDict(frozen=True)

    action: Literal["drop_rest"]
    comment: str | None = None


PipelineStep = Annotated[
    Union[
        PassthroughStep,
        PassthroughRestStep,
        MockStep,
        DelayStep,
        DropStep,
        DropRestStep,
    ],
    Field(discriminator="action"),
]

_POST_REST_ACTIONS: frozenset[str] = frozenset({"mock", "delay"})
_FULL_MOCK_ALLOWED_ACTIONS: frozenset[str] = frozenset({"mock", "delay"})


# ---------------------------------------------------------------------------
# Mock config
# ---------------------------------------------------------------------------


class MatchConfig(BaseModel):
    model_config = ConfigDict(frozen=True)

    url_pattern: str

    @field_validator("url_pattern")
    @classmethod
    def validate_regex(cls, v: str) -> str:
        try:
            re.compile(v)
        except re.error as exc:
            raise ValueError(f"Invalid regex pattern: {exc}") from exc
        return v


class MockConfig(BaseModel):
    model_config = ConfigDict(frozen=True)

    name: str
    description: str | None = None
    enabled: bool
    match: MatchConfig
    mode: Literal["pipeline", "full_mock"]
    pipeline: list[PipelineStep]

    @model_validator(mode="after")
    def validate_pipeline_rules(self) -> "MockConfig":
        seen_rest = False
        for i, step in enumerate(self.pipeline):
            action = step.action
            if seen_rest:
                if action not in _POST_REST_ACTIONS:
                    raise ValueError(
                        f"Step {i} (action='{action}') is not allowed after "
                        f"'passthrough_rest' or 'drop_rest'. "
                        f"Only {sorted(_POST_REST_ACTIONS)} are permitted."
                    )
            if action in {"passthrough_rest", "drop_rest"}:
                if seen_rest:
                    raise ValueError(
                        f"Step {i}: only one '*_rest' step is allowed per pipeline."
                    )
                seen_rest = True
            if self.mode == "full_mock" and action not in _FULL_MOCK_ALLOWED_ACTIONS:
                raise ValueError(
                    f"Step {i} (action='{action}') not allowed in 'full_mock' mode. "
                    f"Only {sorted(_FULL_MOCK_ALLOWED_ACTIONS)} are permitted."
                )
        return self


# ---------------------------------------------------------------------------
# WebSocket messages: Server → UI
# ---------------------------------------------------------------------------


class NewSessionMsg(BaseModel):
    model_config = ConfigDict(frozen=True)
    type: Literal["new_session"]
    session: SessionInfo


class EventMsg(BaseModel):
    model_config = ConfigDict(frozen=True)
    type: Literal["event"]
    session_id: str
    index: int
    event: SSEEvent


class StreamEndMsg(BaseModel):
    model_config = ConfigDict(frozen=True)
    type: Literal["stream_end"]
    session_id: str


class ErrorMsg(BaseModel):
    model_config = ConfigDict(frozen=True)
    type: Literal["error"]
    session_id: str
    message: str


class SessionUpdatedMsg(BaseModel):
    model_config = ConfigDict(frozen=True)
    type: Literal["session_updated"]
    session: SessionInfo


class TlsErrorMsg(BaseModel):
    model_config = ConfigDict(frozen=True)
    type: Literal["tls_error"]
    client_ip: str
    sni: str | None = None
    timestamp: float


ServerMsg = Annotated[
    Union[
        NewSessionMsg,
        EventMsg,
        StreamEndMsg,
        ErrorMsg,
        SessionUpdatedMsg,
        TlsErrorMsg,
    ],
    Field(discriminator="type"),
]


# ---------------------------------------------------------------------------
# WebSocket commands: UI → Server
# ---------------------------------------------------------------------------


class ForwardCmd(BaseModel):
    model_config = ConfigDict(frozen=True)
    type: Literal["forward"]
    session_id: str
    index: int


class EditCmd(BaseModel):
    model_config = ConfigDict(frozen=True)
    type: Literal["edit"]
    session_id: str
    index: int
    event: SSEEvent


class DropCmd(BaseModel):
    model_config = ConfigDict(frozen=True)
    type: Literal["drop"]
    session_id: str
    index: int


class InjectCmd(BaseModel):
    model_config = ConfigDict(frozen=True)
    type: Literal["inject"]
    session_id: str
    after_index: int
    event: SSEEvent


class DelayCmd(BaseModel):
    model_config = ConfigDict(frozen=True)
    type: Literal["delay"]
    session_id: str
    index: int
    delay_ms: Annotated[int, Field(gt=0)]


class ForwardAllCmd(BaseModel):
    model_config = ConfigDict(frozen=True)
    type: Literal["forward_all"]
    session_id: str


class SaveSessionCmd(BaseModel):
    model_config = ConfigDict(frozen=True)
    type: Literal["save_session"]
    session_id: str
    filename: str


ClientCmd = Annotated[
    Union[
        ForwardCmd,
        EditCmd,
        DropCmd,
        InjectCmd,
        DelayCmd,
        ForwardAllCmd,
        SaveSessionCmd,
    ],
    Field(discriminator="type"),
]
