/* Generated from packages/contracts/schemas. Run pnpm contracts:generate. Do not edit. */
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// ajv-runtime:ajv/dist/runtime/ucs2length
var require_ucs2length = __commonJS({
  "ajv-runtime:ajv/dist/runtime/ucs2length"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function ucs2length(str) {
      const len = str.length;
      let length = 0;
      let pos = 0;
      let value;
      while (pos < len) {
        length++;
        value = str.charCodeAt(pos++);
        if (value >= 55296 && value <= 56319 && pos < len) {
          value = str.charCodeAt(pos);
          if ((value & 64512) === 56320)
            pos++;
        }
      }
      return length;
    }
    exports.default = ucs2length;
    ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default';
  }
});

// validators.generated.js
var validateSnapshot = validate10;
var schema11 = { "$schema": "http://json-schema.org/draft-07/schema#", "$id": "https://maaverge.local/contracts/runtime.schema.json", "$comment": "Authoritative runtime contract. Edit this source, then run pnpm contracts:generate. Defaults are applied by the application models, not validators.", "$defs": { "Budgets": { "additionalProperties": false, "properties": { "originium": { "default": 0, "maximum": 100, "minimum": 0, "title": "Originium", "type": "integer" }, "medicine": { "default": 0, "maximum": 100, "minimum": 0, "title": "Medicine", "type": "integer" }, "expedited": { "default": 0, "maximum": 100, "minimum": 0, "title": "Expedited", "type": "integer" } }, "required": ["originium", "medicine", "expedited"], "title": "Budgets", "type": "object" }, "CaptureSettings": { "type": "object", "additionalProperties": false, "properties": { "method": { "type": "string", "enum": ["adb", "mumu", "ldplayer"], "default": "adb" }, "autoDetect": { "type": "boolean", "description": "\u8FDE\u63A5\u65F6\u81EA\u52A8\u8BC6\u522B\u6A21\u62DF\u5668\u5E76\u914D\u7F6E\u589E\u5F3A\u622A\u56FE\uFF1B\u7701\u7565\u65F6 adb \u4E3A\u81EA\u52A8\uFF0C\u5DF2\u6709\u589E\u5F3A\u622A\u56FE\u4E3A\u624B\u52A8\u3002" }, "emulatorPath": { "type": "string", "maxLength": 4096, "default": "" }, "instanceIndex": { "type": "integer", "minimum": 0, "maximum": 65535, "default": 0 }, "mumuTouch": { "type": "boolean", "default": false }, "mumuBridge": { "type": "boolean", "default": false } }, "required": ["method", "emulatorPath", "instanceIndex"] }, "ConnectionSettings": { "type": "object", "additionalProperties": false, "properties": { "adbPath": { "type": "string", "maxLength": 4096, "default": "" }, "address": { "type": "string", "maxLength": 128, "default": "" }, "config": { "type": "string", "enum": ["General", "BlueStacks", "MuMuEmulator12", "MuMuArm", "LDPlayer", "Nox", "XYAZ", "Compatible", "SecondResolution", "CompatMac", "CompatPOSIXShell", "Waydroid", "AVD", "Androws", "WSA"], "default": "General" }, "touchMode": { "type": "string", "enum": ["minitouch", "maatouch", "adb", "MaaFwAdb"], "default": "minitouch" }, "adbLite": { "type": "boolean", "default": false }, "clientType": { "type": "string", "enum": ["Official", "Bilibili", "YoStarEN", "YoStarJP", "YoStarKR", "txwy"], "default": "Official" } }, "required": ["adbPath", "address", "config", "touchMode", "adbLite", "clientType"] }, "DeviceConnectionProfile": { "type": "object", "additionalProperties": false, "required": ["id", "name", "address", "connection", "capture"], "properties": { "id": { "type": "string", "minLength": 1, "maxLength": 80, "pattern": "^[A-Za-z0-9_-]+$" }, "autoDetected": { "type": "boolean", "description": "\u7531\u8FD0\u884C\u4E2D\u7684\u6A21\u62DF\u5668\u81EA\u52A8\u53D1\u73B0\u521B\u5EFA\uFF1B\u7528\u6237\u7F16\u8F91\u4FDD\u5B58\u540E\u8F6C\u4E3A\u624B\u52A8\u7BA1\u7406\u3002" }, "name": { "type": "string", "minLength": 1, "maxLength": 80 }, "address": { "type": "string", "minLength": 1, "maxLength": 128 }, "connection": { "$ref": "#/$defs/ConnectionSettings" }, "capture": { "$ref": "#/$defs/CaptureSettings" } } }, "Device": { "additionalProperties": false, "properties": { "connectionProfileId": { "type": "string", "maxLength": 80 }, "connectionError": { "type": "string", "maxLength": 4096 }, "id": { "title": "Id", "type": "string" }, "name": { "title": "Name", "type": "string" }, "address": { "title": "Address", "type": "string" }, "state": { "enum": ["idle", "running", "offline"], "title": "State", "type": "string" }, "coreVersion": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Coreversion" }, "captureMethod": { "type": "string", "maxLength": 128 }, "dataSync": { "$ref": "#/$defs/UserDataSync" }, "resourceVersion": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Resourceversion" } }, "required": ["id", "name", "address", "state", "coreVersion", "resourceVersion"], "title": "Device", "type": "object" }, "Event": { "additionalProperties": false, "properties": { "id": { "title": "Id", "type": "integer" }, "type": { "title": "Type", "type": "string" }, "message": { "title": "Message", "type": "string" }, "createdAt": { "title": "Createdat", "type": "string" }, "data": { "additionalProperties": true, "title": "Data", "type": "object" } }, "required": ["id", "type", "message", "createdAt", "data"], "title": "Event", "type": "object" }, "ModelSettings": { "additionalProperties": false, "properties": { "provider": { "default": "none", "title": "Provider", "type": "string" }, "baseUrl": { "default": "", "title": "Baseurl", "type": "string" }, "model": { "default": "", "title": "Model", "type": "string" } }, "required": ["provider", "baseUrl", "model"], "title": "ModelSettings", "type": "object" }, "Plan": { "additionalProperties": false, "properties": { "id": { "default": "", "title": "Id", "type": "string" }, "name": { "maxLength": 80, "minLength": 1, "title": "Name", "type": "string" }, "description": { "default": "", "maxLength": 500, "title": "Description", "type": "string" }, "deviceId": { "anyOf": [{ "maxLength": 200, "minLength": 1, "type": "string" }, { "type": "null" }], "default": null, "title": "Deviceid" }, "group": { "default": "daily", "enum": ["daily", "specialized"], "title": "Group", "type": "string" }, "budgets": { "anyOf": [{ "$ref": "#/$defs/Budgets" }, { "type": "null" }], "default": null }, "tasks": { "items": { "$ref": "#/$defs/Task" }, "maxItems": 30, "minItems": 1, "title": "Tasks", "type": "array" }, "schedule": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Schedule" }, "enabled": { "default": true, "title": "Enabled", "type": "boolean" } }, "required": ["id", "name", "description", "deviceId", "group", "budgets", "tasks", "schedule", "enabled"], "title": "Plan", "type": "object" }, "Run": { "additionalProperties": false, "properties": { "planName": { "type": "string", "maxLength": 80 }, "tasks": { "type": "array", "maxItems": 30, "items": { "$ref": "#/$defs/RunTask" } }, "id": { "title": "Id", "type": "string" }, "planId": { "title": "Planid", "type": "string" }, "deviceId": { "title": "Deviceid", "type": "string" }, "status": { "enum": ["running", "completed", "failed", "stopped"], "title": "Status", "type": "string" }, "progress": { "maximum": 100, "minimum": 0, "title": "Progress", "type": "integer" }, "message": { "title": "Message", "type": "string" }, "startedAt": { "title": "Startedat", "type": "string" }, "finishedAt": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Finishedat" } }, "required": ["id", "planId", "deviceId", "status", "progress", "message", "startedAt", "finishedAt"], "title": "Run", "type": "object" }, "RunTask": { "type": "object", "additionalProperties": false, "required": ["index", "type", "status", "message", "startedAt", "finishedAt", "drops", "infrastructure", "artifacts"], "properties": { "index": { "type": "integer", "minimum": 0, "maximum": 29 }, "type": { "type": "string", "maxLength": 80 }, "status": { "enum": ["waiting", "running", "completed", "failed", "stopped", "skipped"] }, "message": { "type": "string", "maxLength": 1e3 }, "startedAt": { "type": ["string", "null"] }, "finishedAt": { "type": ["string", "null"] }, "drops": { "type": "array", "maxItems": 200, "items": { "$ref": "#/$defs/RunDrop" } }, "infrastructure": { "type": "array", "maxItems": 100, "items": { "$ref": "#/$defs/RunInfrastructure" } }, "artifacts": { "type": "array", "maxItems": 3, "items": { "$ref": "#/$defs/RunArtifact" } } } }, "RunDrop": { "type": "object", "additionalProperties": false, "required": ["itemId", "name", "quantity", "stage", "at"], "properties": { "itemId": { "type": "string", "minLength": 1, "maxLength": 200 }, "name": { "type": "string", "maxLength": 200 }, "quantity": { "type": "integer", "minimum": 0, "maximum": 2147483647 }, "stage": { "type": "string", "maxLength": 200 }, "at": { "type": "string" } } }, "RunInfrastructure": { "type": "object", "additionalProperties": false, "required": ["facility", "room", "operators", "product", "message", "at"], "properties": { "facility": { "type": "string", "maxLength": 80 }, "room": { "type": "integer", "minimum": 0, "maximum": 100 }, "operators": { "type": "array", "maxItems": 20, "items": { "type": "string", "maxLength": 80 } }, "staffingStatus": { "description": "Latest staffing evidence; configured names are not an independently recognized final roster.", "enum": ["planned", "confirmed", "unavailable"] }, "product": { "type": "string", "maxLength": 200 }, "message": { "type": "string", "maxLength": 500 }, "at": { "type": "string" } } }, "RunArtifact": { "description": "Bounded local observation captured after a native result callback, not the original recognition image. PNG bytes are fetched separately and never stored in snapshots or SQLite.", "type": "object", "additionalProperties": false, "required": ["id", "kind", "label", "capturedAt", "width", "height"], "properties": { "id": { "type": "string", "pattern": "^[a-f0-9-]{36}$" }, "kind": { "const": "screenshot" }, "label": { "type": "string", "maxLength": 100 }, "capturedAt": { "type": "string" }, "width": { "type": "integer", "minimum": 1, "maximum": 8192 }, "height": { "type": "integer", "minimum": 1, "maximum": 8192 } } }, "InfrastructureLine": { "type": "object", "additionalProperties": false, "required": ["id", "name", "unit", "hourlyRate", "capacity", "lastCollectedAt"], "properties": { "id": { "type": "string", "minLength": 1, "maxLength": 100 }, "name": { "type": "string", "minLength": 1, "maxLength": 80 }, "unit": { "type": "string", "minLength": 1, "maxLength": 20 }, "hourlyRate": { "type": "number", "minimum": 0, "maximum": 1e9 }, "capacity": { "type": "number", "exclusiveMinimum": 0, "maximum": 1e9 }, "lastCollectedAt": { "type": "string", "minLength": 20, "maxLength": 40 } } }, "InfrastructureEstimateProfile": { "type": "object", "additionalProperties": false, "required": ["deviceId", "lines"], "properties": { "deviceId": { "type": "string", "minLength": 1, "maxLength": 200 }, "lines": { "type": "array", "maxItems": 20, "items": { "$ref": "#/$defs/InfrastructureLine" } } } }, "ComponentPaths": { "description": "Absolute installation/download roots. An empty string restores the application default on settings.save.", "type": "object", "additionalProperties": false, "required": ["core", "resource"], "properties": { "core": { "type": "string", "maxLength": 4096 }, "resource": { "type": "string", "maxLength": 4096 } } }, "ComponentDownload": { "description": "Component download engine. Empty aria2Path resolves aria2c from PATH; otherwise use an absolute executable path. Changes apply to subsequent downloads.", "type": "object", "additionalProperties": false, "required": ["engine", "aria2Path"], "properties": { "engine": { "type": "string", "enum": ["builtin", "aria2"] }, "aria2Path": { "type": "string", "maxLength": 4096 } } }, "ResourceActivityVersion": { "type": "object", "additionalProperties": false, "required": ["clientType", "name", "lastUpdated"], "properties": { "clientType": { "enum": ["Official", "Bilibili", "YoStarEN", "YoStarJP", "YoStarKR", "txwy"] }, "name": { "type": ["string", "null"], "maxLength": 300 }, "lastUpdated": { "type": ["string", "null"], "maxLength": 200 } } }, "Settings": { "additionalProperties": false, "properties": { "componentPaths": { "$ref": "#/$defs/ComponentPaths" }, "componentDownload": { "$ref": "#/$defs/ComponentDownload" }, "infrastructureEstimates": { "type": "array", "maxItems": 100, "items": { "$ref": "#/$defs/InfrastructureEstimateProfile" } }, "capture": { "$ref": "#/$defs/CaptureSettings" }, "connection": { "$ref": "#/$defs/ConnectionSettings" }, "deviceProfiles": { "type": "array", "maxItems": 32, "items": { "$ref": "#/$defs/DeviceConnectionProfile" } }, "logRetentionDays": { "type": "integer", "enum": [0, 7, 14, 30], "default": 7, "description": "Log retention in days; zero disables automatic cleanup." }, "autoConnect": { "default": true, "title": "Autoconnect", "type": "boolean" }, "autoUpdateCore": { "default": true, "title": "Autoupdatecore", "type": "boolean" }, "autoUpdateResource": { "default": true, "title": "Autoupdateresource", "type": "boolean" }, "minimizeToTray": { "default": true, "title": "Minimizetotray", "type": "boolean" }, "theme": { "default": "system", "enum": ["dark", "light", "system"], "title": "Theme", "type": "string" }, "budgets": { "$ref": "#/$defs/Budgets" }, "model": { "$ref": "#/$defs/ModelSettings" } }, "required": ["autoConnect", "autoUpdateCore", "autoUpdateResource", "minimizeToTray", "theme", "budgets", "model"], "title": "Settings", "type": "object" }, "UserDataSync": { "type": "object", "additionalProperties": false, "properties": { "operatorsAt": { "type": ["string", "null"], "maxLength": 64 }, "depotAt": { "type": ["string", "null"], "maxLength": 64 } }, "required": ["operatorsAt", "depotAt"] }, "Task": { "additionalProperties": false, "properties": { "type": { "enum": ["StartUp", "CloseDown", "Fight", "Recruit", "Infrast", "Mall", "Award", "SwitchTheme", "Roguelike", "Copilot", "SSSCopilot", "ParadoxCopilot", "Depot", "OperBox", "Reclamation", "Custom", "SingleStep", "VideoRecognition", "OperProgress", "UserDataUpdate"], "title": "Type", "type": "string" }, "params": { "additionalProperties": true, "title": "Params", "type": "object" }, "enabled": { "default": true, "title": "Enabled", "type": "boolean" } }, "required": ["type", "params", "enabled"], "title": "Task", "type": "object" }, "UpdateChannel": { "additionalProperties": false, "properties": { "installDirectory": { "type": "string", "maxLength": 4096 }, "resourceActivities": { "type": "array", "maxItems": 6, "items": { "$ref": "#/$defs/ResourceActivityVersion" } }, "id": { "enum": ["app", "core", "resource"], "title": "Id", "type": "string" }, "currentVersion": { "title": "Currentversion", "type": "string" }, "latestVersion": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Latestversion" }, "status": { "default": "idle", "enum": ["idle", "checking", "available", "downloading", "staged", "waiting_idle", "active", "failed"], "title": "Status", "type": "string" }, "progress": { "default": 0, "maximum": 100, "minimum": 0, "title": "Progress", "type": "integer" }, "message": { "default": "", "title": "Message", "type": "string" } }, "required": ["id", "currentVersion", "latestVersion", "status", "progress", "message"], "title": "UpdateChannel", "type": "object" } }, "additionalProperties": false, "properties": { "mode": { "enum": ["native"], "title": "Mode", "type": "string" }, "devices": { "items": { "$ref": "#/$defs/Device" }, "title": "Devices", "type": "array" }, "plans": { "items": { "$ref": "#/$defs/Plan" }, "title": "Plans", "type": "array" }, "runs": { "items": { "$ref": "#/$defs/Run" }, "title": "Runs", "type": "array" }, "updates": { "items": { "$ref": "#/$defs/UpdateChannel" }, "title": "Updates", "type": "array" }, "settings": { "$ref": "#/$defs/Settings" }, "events": { "items": { "$ref": "#/$defs/Event" }, "title": "Events", "type": "array" } }, "required": ["mode", "devices", "plans", "runs", "updates", "settings", "events"], "title": "Snapshot", "type": "object" };
var schema12 = { "additionalProperties": false, "properties": { "connectionProfileId": { "type": "string", "maxLength": 80 }, "connectionError": { "type": "string", "maxLength": 4096 }, "id": { "title": "Id", "type": "string" }, "name": { "title": "Name", "type": "string" }, "address": { "title": "Address", "type": "string" }, "state": { "enum": ["idle", "running", "offline"], "title": "State", "type": "string" }, "coreVersion": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Coreversion" }, "captureMethod": { "type": "string", "maxLength": 128 }, "dataSync": { "$ref": "#/$defs/UserDataSync" }, "resourceVersion": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Resourceversion" } }, "required": ["id", "name", "address", "state", "coreVersion", "resourceVersion"], "title": "Device", "type": "object" };
var schema13 = { "type": "object", "additionalProperties": false, "properties": { "operatorsAt": { "type": ["string", "null"], "maxLength": 64 }, "depotAt": { "type": ["string", "null"], "maxLength": 64 } }, "required": ["operatorsAt", "depotAt"] };
var func2 = Object.prototype.hasOwnProperty;
var func3 = require_ucs2length().default;
function validate11(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.id === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.name === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.address === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "address" }, message: "must have required property 'address'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.state === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.coreVersion === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "coreVersion" }, message: "must have required property 'coreVersion'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.resourceVersion === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "resourceVersion" }, message: "must have required property 'resourceVersion'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func2.call(schema12.properties, key0)) {
        const err6 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.connectionProfileId !== void 0) {
      let data0 = data.connectionProfileId;
      if (typeof data0 === "string") {
        if (func3(data0) > 80) {
          const err7 = { instancePath: instancePath + "/connectionProfileId", schemaPath: "#/properties/connectionProfileId/maxLength", keyword: "maxLength", params: { limit: 80 }, message: "must NOT have more than 80 characters" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      } else {
        const err8 = { instancePath: instancePath + "/connectionProfileId", schemaPath: "#/properties/connectionProfileId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.connectionError !== void 0) {
      let data1 = data.connectionError;
      if (typeof data1 === "string") {
        if (func3(data1) > 4096) {
          const err9 = { instancePath: instancePath + "/connectionError", schemaPath: "#/properties/connectionError/maxLength", keyword: "maxLength", params: { limit: 4096 }, message: "must NOT have more than 4096 characters" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      } else {
        const err10 = { instancePath: instancePath + "/connectionError", schemaPath: "#/properties/connectionError/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.id !== void 0) {
      if (typeof data.id !== "string") {
        const err11 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.name !== void 0) {
      if (typeof data.name !== "string") {
        const err12 = { instancePath: instancePath + "/name", schemaPath: "#/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.address !== void 0) {
      if (typeof data.address !== "string") {
        const err13 = { instancePath: instancePath + "/address", schemaPath: "#/properties/address/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
    if (data.state !== void 0) {
      let data5 = data.state;
      if (typeof data5 !== "string") {
        const err14 = { instancePath: instancePath + "/state", schemaPath: "#/properties/state/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
      if (!(data5 === "idle" || data5 === "running" || data5 === "offline")) {
        const err15 = { instancePath: instancePath + "/state", schemaPath: "#/properties/state/enum", keyword: "enum", params: { allowedValues: schema12.properties.state.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.coreVersion !== void 0) {
      let data6 = data.coreVersion;
      const _errs15 = errors;
      let valid1 = false;
      const _errs16 = errors;
      if (typeof data6 !== "string") {
        const err16 = { instancePath: instancePath + "/coreVersion", schemaPath: "#/properties/coreVersion/anyOf/0/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
      var _valid0 = _errs16 === errors;
      valid1 = valid1 || _valid0;
      if (!valid1) {
        const _errs18 = errors;
        if (data6 !== null) {
          const err17 = { instancePath: instancePath + "/coreVersion", schemaPath: "#/properties/coreVersion/anyOf/1/type", keyword: "type", params: { type: "null" }, message: "must be null" };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
        var _valid0 = _errs18 === errors;
        valid1 = valid1 || _valid0;
      }
      if (!valid1) {
        const err18 = { instancePath: instancePath + "/coreVersion", schemaPath: "#/properties/coreVersion/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      } else {
        errors = _errs15;
        if (vErrors !== null) {
          if (_errs15) {
            vErrors.length = _errs15;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.captureMethod !== void 0) {
      let data7 = data.captureMethod;
      if (typeof data7 === "string") {
        if (func3(data7) > 128) {
          const err19 = { instancePath: instancePath + "/captureMethod", schemaPath: "#/properties/captureMethod/maxLength", keyword: "maxLength", params: { limit: 128 }, message: "must NOT have more than 128 characters" };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
      } else {
        const err20 = { instancePath: instancePath + "/captureMethod", schemaPath: "#/properties/captureMethod/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
    }
    if (data.dataSync !== void 0) {
      let data8 = data.dataSync;
      if (data8 && typeof data8 == "object" && !Array.isArray(data8)) {
        if (data8.operatorsAt === void 0) {
          const err21 = { instancePath: instancePath + "/dataSync", schemaPath: "#/$defs/UserDataSync/required", keyword: "required", params: { missingProperty: "operatorsAt" }, message: "must have required property 'operatorsAt'" };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
        if (data8.depotAt === void 0) {
          const err22 = { instancePath: instancePath + "/dataSync", schemaPath: "#/$defs/UserDataSync/required", keyword: "required", params: { missingProperty: "depotAt" }, message: "must have required property 'depotAt'" };
          if (vErrors === null) {
            vErrors = [err22];
          } else {
            vErrors.push(err22);
          }
          errors++;
        }
        for (const key1 in data8) {
          if (!(key1 === "operatorsAt" || key1 === "depotAt")) {
            const err23 = { instancePath: instancePath + "/dataSync", schemaPath: "#/$defs/UserDataSync/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
        }
        if (data8.operatorsAt !== void 0) {
          let data9 = data8.operatorsAt;
          if (typeof data9 !== "string" && data9 !== null) {
            const err24 = { instancePath: instancePath + "/dataSync/operatorsAt", schemaPath: "#/$defs/UserDataSync/properties/operatorsAt/type", keyword: "type", params: { type: schema13.properties.operatorsAt.type }, message: "must be string,null" };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
          if (typeof data9 === "string") {
            if (func3(data9) > 64) {
              const err25 = { instancePath: instancePath + "/dataSync/operatorsAt", schemaPath: "#/$defs/UserDataSync/properties/operatorsAt/maxLength", keyword: "maxLength", params: { limit: 64 }, message: "must NOT have more than 64 characters" };
              if (vErrors === null) {
                vErrors = [err25];
              } else {
                vErrors.push(err25);
              }
              errors++;
            }
          }
        }
        if (data8.depotAt !== void 0) {
          let data10 = data8.depotAt;
          if (typeof data10 !== "string" && data10 !== null) {
            const err26 = { instancePath: instancePath + "/dataSync/depotAt", schemaPath: "#/$defs/UserDataSync/properties/depotAt/type", keyword: "type", params: { type: schema13.properties.depotAt.type }, message: "must be string,null" };
            if (vErrors === null) {
              vErrors = [err26];
            } else {
              vErrors.push(err26);
            }
            errors++;
          }
          if (typeof data10 === "string") {
            if (func3(data10) > 64) {
              const err27 = { instancePath: instancePath + "/dataSync/depotAt", schemaPath: "#/$defs/UserDataSync/properties/depotAt/maxLength", keyword: "maxLength", params: { limit: 64 }, message: "must NOT have more than 64 characters" };
              if (vErrors === null) {
                vErrors = [err27];
              } else {
                vErrors.push(err27);
              }
              errors++;
            }
          }
        }
      } else {
        const err28 = { instancePath: instancePath + "/dataSync", schemaPath: "#/$defs/UserDataSync/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err28];
        } else {
          vErrors.push(err28);
        }
        errors++;
      }
    }
    if (data.resourceVersion !== void 0) {
      let data11 = data.resourceVersion;
      const _errs31 = errors;
      let valid4 = false;
      const _errs32 = errors;
      if (typeof data11 !== "string") {
        const err29 = { instancePath: instancePath + "/resourceVersion", schemaPath: "#/properties/resourceVersion/anyOf/0/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err29];
        } else {
          vErrors.push(err29);
        }
        errors++;
      }
      var _valid1 = _errs32 === errors;
      valid4 = valid4 || _valid1;
      if (!valid4) {
        const _errs34 = errors;
        if (data11 !== null) {
          const err30 = { instancePath: instancePath + "/resourceVersion", schemaPath: "#/properties/resourceVersion/anyOf/1/type", keyword: "type", params: { type: "null" }, message: "must be null" };
          if (vErrors === null) {
            vErrors = [err30];
          } else {
            vErrors.push(err30);
          }
          errors++;
        }
        var _valid1 = _errs34 === errors;
        valid4 = valid4 || _valid1;
      }
      if (!valid4) {
        const err31 = { instancePath: instancePath + "/resourceVersion", schemaPath: "#/properties/resourceVersion/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err31];
        } else {
          vErrors.push(err31);
        }
        errors++;
      } else {
        errors = _errs31;
        if (vErrors !== null) {
          if (_errs31) {
            vErrors.length = _errs31;
          } else {
            vErrors = null;
          }
        }
      }
    }
  } else {
    const err32 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err32];
    } else {
      vErrors.push(err32);
    }
    errors++;
  }
  validate11.errors = vErrors;
  return errors === 0;
}
var schema14 = { "additionalProperties": false, "properties": { "id": { "default": "", "title": "Id", "type": "string" }, "name": { "maxLength": 80, "minLength": 1, "title": "Name", "type": "string" }, "description": { "default": "", "maxLength": 500, "title": "Description", "type": "string" }, "deviceId": { "anyOf": [{ "maxLength": 200, "minLength": 1, "type": "string" }, { "type": "null" }], "default": null, "title": "Deviceid" }, "group": { "default": "daily", "enum": ["daily", "specialized"], "title": "Group", "type": "string" }, "budgets": { "anyOf": [{ "$ref": "#/$defs/Budgets" }, { "type": "null" }], "default": null }, "tasks": { "items": { "$ref": "#/$defs/Task" }, "maxItems": 30, "minItems": 1, "title": "Tasks", "type": "array" }, "schedule": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Schedule" }, "enabled": { "default": true, "title": "Enabled", "type": "boolean" } }, "required": ["id", "name", "description", "deviceId", "group", "budgets", "tasks", "schedule", "enabled"], "title": "Plan", "type": "object" };
var schema16 = { "additionalProperties": false, "properties": { "type": { "enum": ["StartUp", "CloseDown", "Fight", "Recruit", "Infrast", "Mall", "Award", "SwitchTheme", "Roguelike", "Copilot", "SSSCopilot", "ParadoxCopilot", "Depot", "OperBox", "Reclamation", "Custom", "SingleStep", "VideoRecognition", "OperProgress", "UserDataUpdate"], "title": "Type", "type": "string" }, "params": { "additionalProperties": true, "title": "Params", "type": "object" }, "enabled": { "default": true, "title": "Enabled", "type": "boolean" } }, "required": ["type", "params", "enabled"], "title": "Task", "type": "object" };
function validate13(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.id === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.name === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.description === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "description" }, message: "must have required property 'description'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.deviceId === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "deviceId" }, message: "must have required property 'deviceId'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.group === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "group" }, message: "must have required property 'group'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.budgets === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "budgets" }, message: "must have required property 'budgets'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.tasks === void 0) {
      const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "tasks" }, message: "must have required property 'tasks'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.schedule === void 0) {
      const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "schedule" }, message: "must have required property 'schedule'" };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.enabled === void 0) {
      const err8 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "enabled" }, message: "must have required property 'enabled'" };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func2.call(schema14.properties, key0)) {
        const err9 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.id !== void 0) {
      if (typeof data.id !== "string") {
        const err10 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.name !== void 0) {
      let data1 = data.name;
      if (typeof data1 === "string") {
        if (func3(data1) > 80) {
          const err11 = { instancePath: instancePath + "/name", schemaPath: "#/properties/name/maxLength", keyword: "maxLength", params: { limit: 80 }, message: "must NOT have more than 80 characters" };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
        if (func3(data1) < 1) {
          const err12 = { instancePath: instancePath + "/name", schemaPath: "#/properties/name/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
      } else {
        const err13 = { instancePath: instancePath + "/name", schemaPath: "#/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
    if (data.description !== void 0) {
      let data2 = data.description;
      if (typeof data2 === "string") {
        if (func3(data2) > 500) {
          const err14 = { instancePath: instancePath + "/description", schemaPath: "#/properties/description/maxLength", keyword: "maxLength", params: { limit: 500 }, message: "must NOT have more than 500 characters" };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
      } else {
        const err15 = { instancePath: instancePath + "/description", schemaPath: "#/properties/description/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.deviceId !== void 0) {
      let data3 = data.deviceId;
      const _errs9 = errors;
      let valid1 = false;
      const _errs10 = errors;
      if (typeof data3 === "string") {
        if (func3(data3) > 200) {
          const err16 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/anyOf/0/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
        if (func3(data3) < 1) {
          const err17 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/anyOf/0/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
      } else {
        const err18 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/anyOf/0/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
      var _valid0 = _errs10 === errors;
      valid1 = valid1 || _valid0;
      if (!valid1) {
        const _errs12 = errors;
        if (data3 !== null) {
          const err19 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/anyOf/1/type", keyword: "type", params: { type: "null" }, message: "must be null" };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
        var _valid0 = _errs12 === errors;
        valid1 = valid1 || _valid0;
      }
      if (!valid1) {
        const err20 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      } else {
        errors = _errs9;
        if (vErrors !== null) {
          if (_errs9) {
            vErrors.length = _errs9;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.group !== void 0) {
      let data4 = data.group;
      if (typeof data4 !== "string") {
        const err21 = { instancePath: instancePath + "/group", schemaPath: "#/properties/group/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
        }
        errors++;
      }
      if (!(data4 === "daily" || data4 === "specialized")) {
        const err22 = { instancePath: instancePath + "/group", schemaPath: "#/properties/group/enum", keyword: "enum", params: { allowedValues: schema14.properties.group.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
    }
    if (data.budgets !== void 0) {
      let data5 = data.budgets;
      const _errs17 = errors;
      let valid2 = false;
      const _errs18 = errors;
      if (data5 && typeof data5 == "object" && !Array.isArray(data5)) {
        if (data5.originium === void 0) {
          const err23 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/required", keyword: "required", params: { missingProperty: "originium" }, message: "must have required property 'originium'" };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
        if (data5.medicine === void 0) {
          const err24 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/required", keyword: "required", params: { missingProperty: "medicine" }, message: "must have required property 'medicine'" };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
        if (data5.expedited === void 0) {
          const err25 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/required", keyword: "required", params: { missingProperty: "expedited" }, message: "must have required property 'expedited'" };
          if (vErrors === null) {
            vErrors = [err25];
          } else {
            vErrors.push(err25);
          }
          errors++;
        }
        for (const key1 in data5) {
          if (!(key1 === "originium" || key1 === "medicine" || key1 === "expedited")) {
            const err26 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err26];
            } else {
              vErrors.push(err26);
            }
            errors++;
          }
        }
        if (data5.originium !== void 0) {
          let data6 = data5.originium;
          if (!(typeof data6 == "number" && (!(data6 % 1) && !isNaN(data6)) && isFinite(data6))) {
            const err27 = { instancePath: instancePath + "/budgets/originium", schemaPath: "#/$defs/Budgets/properties/originium/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err27];
            } else {
              vErrors.push(err27);
            }
            errors++;
          }
          if (typeof data6 == "number" && isFinite(data6)) {
            if (data6 > 100 || isNaN(data6)) {
              const err28 = { instancePath: instancePath + "/budgets/originium", schemaPath: "#/$defs/Budgets/properties/originium/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
              if (vErrors === null) {
                vErrors = [err28];
              } else {
                vErrors.push(err28);
              }
              errors++;
            }
            if (data6 < 0 || isNaN(data6)) {
              const err29 = { instancePath: instancePath + "/budgets/originium", schemaPath: "#/$defs/Budgets/properties/originium/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err29];
              } else {
                vErrors.push(err29);
              }
              errors++;
            }
          }
        }
        if (data5.medicine !== void 0) {
          let data7 = data5.medicine;
          if (!(typeof data7 == "number" && (!(data7 % 1) && !isNaN(data7)) && isFinite(data7))) {
            const err30 = { instancePath: instancePath + "/budgets/medicine", schemaPath: "#/$defs/Budgets/properties/medicine/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err30];
            } else {
              vErrors.push(err30);
            }
            errors++;
          }
          if (typeof data7 == "number" && isFinite(data7)) {
            if (data7 > 100 || isNaN(data7)) {
              const err31 = { instancePath: instancePath + "/budgets/medicine", schemaPath: "#/$defs/Budgets/properties/medicine/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
              if (vErrors === null) {
                vErrors = [err31];
              } else {
                vErrors.push(err31);
              }
              errors++;
            }
            if (data7 < 0 || isNaN(data7)) {
              const err32 = { instancePath: instancePath + "/budgets/medicine", schemaPath: "#/$defs/Budgets/properties/medicine/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err32];
              } else {
                vErrors.push(err32);
              }
              errors++;
            }
          }
        }
        if (data5.expedited !== void 0) {
          let data8 = data5.expedited;
          if (!(typeof data8 == "number" && (!(data8 % 1) && !isNaN(data8)) && isFinite(data8))) {
            const err33 = { instancePath: instancePath + "/budgets/expedited", schemaPath: "#/$defs/Budgets/properties/expedited/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err33];
            } else {
              vErrors.push(err33);
            }
            errors++;
          }
          if (typeof data8 == "number" && isFinite(data8)) {
            if (data8 > 100 || isNaN(data8)) {
              const err34 = { instancePath: instancePath + "/budgets/expedited", schemaPath: "#/$defs/Budgets/properties/expedited/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
              if (vErrors === null) {
                vErrors = [err34];
              } else {
                vErrors.push(err34);
              }
              errors++;
            }
            if (data8 < 0 || isNaN(data8)) {
              const err35 = { instancePath: instancePath + "/budgets/expedited", schemaPath: "#/$defs/Budgets/properties/expedited/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err35];
              } else {
                vErrors.push(err35);
              }
              errors++;
            }
          }
        }
      } else {
        const err36 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err36];
        } else {
          vErrors.push(err36);
        }
        errors++;
      }
      var _valid1 = _errs18 === errors;
      valid2 = valid2 || _valid1;
      if (!valid2) {
        const _errs28 = errors;
        if (data5 !== null) {
          const err37 = { instancePath: instancePath + "/budgets", schemaPath: "#/properties/budgets/anyOf/1/type", keyword: "type", params: { type: "null" }, message: "must be null" };
          if (vErrors === null) {
            vErrors = [err37];
          } else {
            vErrors.push(err37);
          }
          errors++;
        }
        var _valid1 = _errs28 === errors;
        valid2 = valid2 || _valid1;
      }
      if (!valid2) {
        const err38 = { instancePath: instancePath + "/budgets", schemaPath: "#/properties/budgets/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err38];
        } else {
          vErrors.push(err38);
        }
        errors++;
      } else {
        errors = _errs17;
        if (vErrors !== null) {
          if (_errs17) {
            vErrors.length = _errs17;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.tasks !== void 0) {
      let data9 = data.tasks;
      if (Array.isArray(data9)) {
        if (data9.length > 30) {
          const err39 = { instancePath: instancePath + "/tasks", schemaPath: "#/properties/tasks/maxItems", keyword: "maxItems", params: { limit: 30 }, message: "must NOT have more than 30 items" };
          if (vErrors === null) {
            vErrors = [err39];
          } else {
            vErrors.push(err39);
          }
          errors++;
        }
        if (data9.length < 1) {
          const err40 = { instancePath: instancePath + "/tasks", schemaPath: "#/properties/tasks/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
          if (vErrors === null) {
            vErrors = [err40];
          } else {
            vErrors.push(err40);
          }
          errors++;
        }
        const len0 = data9.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data10 = data9[i0];
          if (data10 && typeof data10 == "object" && !Array.isArray(data10)) {
            if (data10.type === void 0) {
              const err41 = { instancePath: instancePath + "/tasks/" + i0, schemaPath: "#/$defs/Task/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
              if (vErrors === null) {
                vErrors = [err41];
              } else {
                vErrors.push(err41);
              }
              errors++;
            }
            if (data10.params === void 0) {
              const err42 = { instancePath: instancePath + "/tasks/" + i0, schemaPath: "#/$defs/Task/required", keyword: "required", params: { missingProperty: "params" }, message: "must have required property 'params'" };
              if (vErrors === null) {
                vErrors = [err42];
              } else {
                vErrors.push(err42);
              }
              errors++;
            }
            if (data10.enabled === void 0) {
              const err43 = { instancePath: instancePath + "/tasks/" + i0, schemaPath: "#/$defs/Task/required", keyword: "required", params: { missingProperty: "enabled" }, message: "must have required property 'enabled'" };
              if (vErrors === null) {
                vErrors = [err43];
              } else {
                vErrors.push(err43);
              }
              errors++;
            }
            for (const key2 in data10) {
              if (!(key2 === "type" || key2 === "params" || key2 === "enabled")) {
                const err44 = { instancePath: instancePath + "/tasks/" + i0, schemaPath: "#/$defs/Task/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err44];
                } else {
                  vErrors.push(err44);
                }
                errors++;
              }
            }
            if (data10.type !== void 0) {
              let data11 = data10.type;
              if (typeof data11 !== "string") {
                const err45 = { instancePath: instancePath + "/tasks/" + i0 + "/type", schemaPath: "#/$defs/Task/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err45];
                } else {
                  vErrors.push(err45);
                }
                errors++;
              }
              if (!(data11 === "StartUp" || data11 === "CloseDown" || data11 === "Fight" || data11 === "Recruit" || data11 === "Infrast" || data11 === "Mall" || data11 === "Award" || data11 === "SwitchTheme" || data11 === "Roguelike" || data11 === "Copilot" || data11 === "SSSCopilot" || data11 === "ParadoxCopilot" || data11 === "Depot" || data11 === "OperBox" || data11 === "Reclamation" || data11 === "Custom" || data11 === "SingleStep" || data11 === "VideoRecognition" || data11 === "OperProgress" || data11 === "UserDataUpdate")) {
                const err46 = { instancePath: instancePath + "/tasks/" + i0 + "/type", schemaPath: "#/$defs/Task/properties/type/enum", keyword: "enum", params: { allowedValues: schema16.properties.type.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err46];
                } else {
                  vErrors.push(err46);
                }
                errors++;
              }
            }
            if (data10.params !== void 0) {
              let data12 = data10.params;
              if (data12 && typeof data12 == "object" && !Array.isArray(data12)) {
              } else {
                const err47 = { instancePath: instancePath + "/tasks/" + i0 + "/params", schemaPath: "#/$defs/Task/properties/params/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err47];
                } else {
                  vErrors.push(err47);
                }
                errors++;
              }
            }
            if (data10.enabled !== void 0) {
              if (typeof data10.enabled !== "boolean") {
                const err48 = { instancePath: instancePath + "/tasks/" + i0 + "/enabled", schemaPath: "#/$defs/Task/properties/enabled/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                if (vErrors === null) {
                  vErrors = [err48];
                } else {
                  vErrors.push(err48);
                }
                errors++;
              }
            }
          } else {
            const err49 = { instancePath: instancePath + "/tasks/" + i0, schemaPath: "#/$defs/Task/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err49];
            } else {
              vErrors.push(err49);
            }
            errors++;
          }
        }
      } else {
        const err50 = { instancePath: instancePath + "/tasks", schemaPath: "#/properties/tasks/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err50];
        } else {
          vErrors.push(err50);
        }
        errors++;
      }
    }
    if (data.schedule !== void 0) {
      let data14 = data.schedule;
      const _errs44 = errors;
      let valid9 = false;
      const _errs45 = errors;
      if (typeof data14 !== "string") {
        const err51 = { instancePath: instancePath + "/schedule", schemaPath: "#/properties/schedule/anyOf/0/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err51];
        } else {
          vErrors.push(err51);
        }
        errors++;
      }
      var _valid2 = _errs45 === errors;
      valid9 = valid9 || _valid2;
      if (!valid9) {
        const _errs47 = errors;
        if (data14 !== null) {
          const err52 = { instancePath: instancePath + "/schedule", schemaPath: "#/properties/schedule/anyOf/1/type", keyword: "type", params: { type: "null" }, message: "must be null" };
          if (vErrors === null) {
            vErrors = [err52];
          } else {
            vErrors.push(err52);
          }
          errors++;
        }
        var _valid2 = _errs47 === errors;
        valid9 = valid9 || _valid2;
      }
      if (!valid9) {
        const err53 = { instancePath: instancePath + "/schedule", schemaPath: "#/properties/schedule/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err53];
        } else {
          vErrors.push(err53);
        }
        errors++;
      } else {
        errors = _errs44;
        if (vErrors !== null) {
          if (_errs44) {
            vErrors.length = _errs44;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.enabled !== void 0) {
      if (typeof data.enabled !== "boolean") {
        const err54 = { instancePath: instancePath + "/enabled", schemaPath: "#/properties/enabled/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err54];
        } else {
          vErrors.push(err54);
        }
        errors++;
      }
    }
  } else {
    const err55 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err55];
    } else {
      vErrors.push(err55);
    }
    errors++;
  }
  validate13.errors = vErrors;
  return errors === 0;
}
var schema17 = { "additionalProperties": false, "properties": { "planName": { "type": "string", "maxLength": 80 }, "tasks": { "type": "array", "maxItems": 30, "items": { "$ref": "#/$defs/RunTask" } }, "id": { "title": "Id", "type": "string" }, "planId": { "title": "Planid", "type": "string" }, "deviceId": { "title": "Deviceid", "type": "string" }, "status": { "enum": ["running", "completed", "failed", "stopped"], "title": "Status", "type": "string" }, "progress": { "maximum": 100, "minimum": 0, "title": "Progress", "type": "integer" }, "message": { "title": "Message", "type": "string" }, "startedAt": { "title": "Startedat", "type": "string" }, "finishedAt": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Finishedat" } }, "required": ["id", "planId", "deviceId", "status", "progress", "message", "startedAt", "finishedAt"], "title": "Run", "type": "object" };
var schema18 = { "type": "object", "additionalProperties": false, "required": ["index", "type", "status", "message", "startedAt", "finishedAt", "drops", "infrastructure", "artifacts"], "properties": { "index": { "type": "integer", "minimum": 0, "maximum": 29 }, "type": { "type": "string", "maxLength": 80 }, "status": { "enum": ["waiting", "running", "completed", "failed", "stopped", "skipped"] }, "message": { "type": "string", "maxLength": 1e3 }, "startedAt": { "type": ["string", "null"] }, "finishedAt": { "type": ["string", "null"] }, "drops": { "type": "array", "maxItems": 200, "items": { "$ref": "#/$defs/RunDrop" } }, "infrastructure": { "type": "array", "maxItems": 100, "items": { "$ref": "#/$defs/RunInfrastructure" } }, "artifacts": { "type": "array", "maxItems": 3, "items": { "$ref": "#/$defs/RunArtifact" } } } };
var schema20 = { "type": "object", "additionalProperties": false, "required": ["facility", "room", "operators", "product", "message", "at"], "properties": { "facility": { "type": "string", "maxLength": 80 }, "room": { "type": "integer", "minimum": 0, "maximum": 100 }, "operators": { "type": "array", "maxItems": 20, "items": { "type": "string", "maxLength": 80 } }, "staffingStatus": { "description": "Latest staffing evidence; configured names are not an independently recognized final roster.", "enum": ["planned", "confirmed", "unavailable"] }, "product": { "type": "string", "maxLength": 200 }, "message": { "type": "string", "maxLength": 500 }, "at": { "type": "string" } } };
var pattern0 = new RegExp("^[a-f0-9-]{36}$", "u");
function validate16(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.index === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "index" }, message: "must have required property 'index'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.type === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.status === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.message === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "message" }, message: "must have required property 'message'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.startedAt === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "startedAt" }, message: "must have required property 'startedAt'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.finishedAt === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "finishedAt" }, message: "must have required property 'finishedAt'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.drops === void 0) {
      const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "drops" }, message: "must have required property 'drops'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.infrastructure === void 0) {
      const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "infrastructure" }, message: "must have required property 'infrastructure'" };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.artifacts === void 0) {
      const err8 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "artifacts" }, message: "must have required property 'artifacts'" };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func2.call(schema18.properties, key0)) {
        const err9 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.index !== void 0) {
      let data0 = data.index;
      if (!(typeof data0 == "number" && (!(data0 % 1) && !isNaN(data0)) && isFinite(data0))) {
        const err10 = { instancePath: instancePath + "/index", schemaPath: "#/properties/index/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
      if (typeof data0 == "number" && isFinite(data0)) {
        if (data0 > 29 || isNaN(data0)) {
          const err11 = { instancePath: instancePath + "/index", schemaPath: "#/properties/index/maximum", keyword: "maximum", params: { comparison: "<=", limit: 29 }, message: "must be <= 29" };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
        if (data0 < 0 || isNaN(data0)) {
          const err12 = { instancePath: instancePath + "/index", schemaPath: "#/properties/index/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
      }
    }
    if (data.type !== void 0) {
      let data1 = data.type;
      if (typeof data1 === "string") {
        if (func3(data1) > 80) {
          const err13 = { instancePath: instancePath + "/type", schemaPath: "#/properties/type/maxLength", keyword: "maxLength", params: { limit: 80 }, message: "must NOT have more than 80 characters" };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
      } else {
        const err14 = { instancePath: instancePath + "/type", schemaPath: "#/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    if (data.status !== void 0) {
      let data2 = data.status;
      if (!(data2 === "waiting" || data2 === "running" || data2 === "completed" || data2 === "failed" || data2 === "stopped" || data2 === "skipped")) {
        const err15 = { instancePath: instancePath + "/status", schemaPath: "#/properties/status/enum", keyword: "enum", params: { allowedValues: schema18.properties.status.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.message !== void 0) {
      let data3 = data.message;
      if (typeof data3 === "string") {
        if (func3(data3) > 1e3) {
          const err16 = { instancePath: instancePath + "/message", schemaPath: "#/properties/message/maxLength", keyword: "maxLength", params: { limit: 1e3 }, message: "must NOT have more than 1000 characters" };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
      } else {
        const err17 = { instancePath: instancePath + "/message", schemaPath: "#/properties/message/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
    if (data.startedAt !== void 0) {
      let data4 = data.startedAt;
      if (typeof data4 !== "string" && data4 !== null) {
        const err18 = { instancePath: instancePath + "/startedAt", schemaPath: "#/properties/startedAt/type", keyword: "type", params: { type: schema18.properties.startedAt.type }, message: "must be string,null" };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
    }
    if (data.finishedAt !== void 0) {
      let data5 = data.finishedAt;
      if (typeof data5 !== "string" && data5 !== null) {
        const err19 = { instancePath: instancePath + "/finishedAt", schemaPath: "#/properties/finishedAt/type", keyword: "type", params: { type: schema18.properties.finishedAt.type }, message: "must be string,null" };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
    }
    if (data.drops !== void 0) {
      let data6 = data.drops;
      if (Array.isArray(data6)) {
        if (data6.length > 200) {
          const err20 = { instancePath: instancePath + "/drops", schemaPath: "#/properties/drops/maxItems", keyword: "maxItems", params: { limit: 200 }, message: "must NOT have more than 200 items" };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
        const len0 = data6.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data7 = data6[i0];
          if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
            if (data7.itemId === void 0) {
              const err21 = { instancePath: instancePath + "/drops/" + i0, schemaPath: "#/$defs/RunDrop/required", keyword: "required", params: { missingProperty: "itemId" }, message: "must have required property 'itemId'" };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
            if (data7.name === void 0) {
              const err22 = { instancePath: instancePath + "/drops/" + i0, schemaPath: "#/$defs/RunDrop/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
              if (vErrors === null) {
                vErrors = [err22];
              } else {
                vErrors.push(err22);
              }
              errors++;
            }
            if (data7.quantity === void 0) {
              const err23 = { instancePath: instancePath + "/drops/" + i0, schemaPath: "#/$defs/RunDrop/required", keyword: "required", params: { missingProperty: "quantity" }, message: "must have required property 'quantity'" };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
            if (data7.stage === void 0) {
              const err24 = { instancePath: instancePath + "/drops/" + i0, schemaPath: "#/$defs/RunDrop/required", keyword: "required", params: { missingProperty: "stage" }, message: "must have required property 'stage'" };
              if (vErrors === null) {
                vErrors = [err24];
              } else {
                vErrors.push(err24);
              }
              errors++;
            }
            if (data7.at === void 0) {
              const err25 = { instancePath: instancePath + "/drops/" + i0, schemaPath: "#/$defs/RunDrop/required", keyword: "required", params: { missingProperty: "at" }, message: "must have required property 'at'" };
              if (vErrors === null) {
                vErrors = [err25];
              } else {
                vErrors.push(err25);
              }
              errors++;
            }
            for (const key1 in data7) {
              if (!(key1 === "itemId" || key1 === "name" || key1 === "quantity" || key1 === "stage" || key1 === "at")) {
                const err26 = { instancePath: instancePath + "/drops/" + i0, schemaPath: "#/$defs/RunDrop/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err26];
                } else {
                  vErrors.push(err26);
                }
                errors++;
              }
            }
            if (data7.itemId !== void 0) {
              let data8 = data7.itemId;
              if (typeof data8 === "string") {
                if (func3(data8) > 200) {
                  const err27 = { instancePath: instancePath + "/drops/" + i0 + "/itemId", schemaPath: "#/$defs/RunDrop/properties/itemId/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                  if (vErrors === null) {
                    vErrors = [err27];
                  } else {
                    vErrors.push(err27);
                  }
                  errors++;
                }
                if (func3(data8) < 1) {
                  const err28 = { instancePath: instancePath + "/drops/" + i0 + "/itemId", schemaPath: "#/$defs/RunDrop/properties/itemId/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err28];
                  } else {
                    vErrors.push(err28);
                  }
                  errors++;
                }
              } else {
                const err29 = { instancePath: instancePath + "/drops/" + i0 + "/itemId", schemaPath: "#/$defs/RunDrop/properties/itemId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err29];
                } else {
                  vErrors.push(err29);
                }
                errors++;
              }
            }
            if (data7.name !== void 0) {
              let data9 = data7.name;
              if (typeof data9 === "string") {
                if (func3(data9) > 200) {
                  const err30 = { instancePath: instancePath + "/drops/" + i0 + "/name", schemaPath: "#/$defs/RunDrop/properties/name/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                  if (vErrors === null) {
                    vErrors = [err30];
                  } else {
                    vErrors.push(err30);
                  }
                  errors++;
                }
              } else {
                const err31 = { instancePath: instancePath + "/drops/" + i0 + "/name", schemaPath: "#/$defs/RunDrop/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err31];
                } else {
                  vErrors.push(err31);
                }
                errors++;
              }
            }
            if (data7.quantity !== void 0) {
              let data10 = data7.quantity;
              if (!(typeof data10 == "number" && (!(data10 % 1) && !isNaN(data10)) && isFinite(data10))) {
                const err32 = { instancePath: instancePath + "/drops/" + i0 + "/quantity", schemaPath: "#/$defs/RunDrop/properties/quantity/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err32];
                } else {
                  vErrors.push(err32);
                }
                errors++;
              }
              if (typeof data10 == "number" && isFinite(data10)) {
                if (data10 > 2147483647 || isNaN(data10)) {
                  const err33 = { instancePath: instancePath + "/drops/" + i0 + "/quantity", schemaPath: "#/$defs/RunDrop/properties/quantity/maximum", keyword: "maximum", params: { comparison: "<=", limit: 2147483647 }, message: "must be <= 2147483647" };
                  if (vErrors === null) {
                    vErrors = [err33];
                  } else {
                    vErrors.push(err33);
                  }
                  errors++;
                }
                if (data10 < 0 || isNaN(data10)) {
                  const err34 = { instancePath: instancePath + "/drops/" + i0 + "/quantity", schemaPath: "#/$defs/RunDrop/properties/quantity/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err34];
                  } else {
                    vErrors.push(err34);
                  }
                  errors++;
                }
              }
            }
            if (data7.stage !== void 0) {
              let data11 = data7.stage;
              if (typeof data11 === "string") {
                if (func3(data11) > 200) {
                  const err35 = { instancePath: instancePath + "/drops/" + i0 + "/stage", schemaPath: "#/$defs/RunDrop/properties/stage/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                  if (vErrors === null) {
                    vErrors = [err35];
                  } else {
                    vErrors.push(err35);
                  }
                  errors++;
                }
              } else {
                const err36 = { instancePath: instancePath + "/drops/" + i0 + "/stage", schemaPath: "#/$defs/RunDrop/properties/stage/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err36];
                } else {
                  vErrors.push(err36);
                }
                errors++;
              }
            }
            if (data7.at !== void 0) {
              if (typeof data7.at !== "string") {
                const err37 = { instancePath: instancePath + "/drops/" + i0 + "/at", schemaPath: "#/$defs/RunDrop/properties/at/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err37];
                } else {
                  vErrors.push(err37);
                }
                errors++;
              }
            }
          } else {
            const err38 = { instancePath: instancePath + "/drops/" + i0, schemaPath: "#/$defs/RunDrop/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err38];
            } else {
              vErrors.push(err38);
            }
            errors++;
          }
        }
      } else {
        const err39 = { instancePath: instancePath + "/drops", schemaPath: "#/properties/drops/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err39];
        } else {
          vErrors.push(err39);
        }
        errors++;
      }
    }
    if (data.infrastructure !== void 0) {
      let data13 = data.infrastructure;
      if (Array.isArray(data13)) {
        if (data13.length > 100) {
          const err40 = { instancePath: instancePath + "/infrastructure", schemaPath: "#/properties/infrastructure/maxItems", keyword: "maxItems", params: { limit: 100 }, message: "must NOT have more than 100 items" };
          if (vErrors === null) {
            vErrors = [err40];
          } else {
            vErrors.push(err40);
          }
          errors++;
        }
        const len1 = data13.length;
        for (let i1 = 0; i1 < len1; i1++) {
          let data14 = data13[i1];
          if (data14 && typeof data14 == "object" && !Array.isArray(data14)) {
            if (data14.facility === void 0) {
              const err41 = { instancePath: instancePath + "/infrastructure/" + i1, schemaPath: "#/$defs/RunInfrastructure/required", keyword: "required", params: { missingProperty: "facility" }, message: "must have required property 'facility'" };
              if (vErrors === null) {
                vErrors = [err41];
              } else {
                vErrors.push(err41);
              }
              errors++;
            }
            if (data14.room === void 0) {
              const err42 = { instancePath: instancePath + "/infrastructure/" + i1, schemaPath: "#/$defs/RunInfrastructure/required", keyword: "required", params: { missingProperty: "room" }, message: "must have required property 'room'" };
              if (vErrors === null) {
                vErrors = [err42];
              } else {
                vErrors.push(err42);
              }
              errors++;
            }
            if (data14.operators === void 0) {
              const err43 = { instancePath: instancePath + "/infrastructure/" + i1, schemaPath: "#/$defs/RunInfrastructure/required", keyword: "required", params: { missingProperty: "operators" }, message: "must have required property 'operators'" };
              if (vErrors === null) {
                vErrors = [err43];
              } else {
                vErrors.push(err43);
              }
              errors++;
            }
            if (data14.product === void 0) {
              const err44 = { instancePath: instancePath + "/infrastructure/" + i1, schemaPath: "#/$defs/RunInfrastructure/required", keyword: "required", params: { missingProperty: "product" }, message: "must have required property 'product'" };
              if (vErrors === null) {
                vErrors = [err44];
              } else {
                vErrors.push(err44);
              }
              errors++;
            }
            if (data14.message === void 0) {
              const err45 = { instancePath: instancePath + "/infrastructure/" + i1, schemaPath: "#/$defs/RunInfrastructure/required", keyword: "required", params: { missingProperty: "message" }, message: "must have required property 'message'" };
              if (vErrors === null) {
                vErrors = [err45];
              } else {
                vErrors.push(err45);
              }
              errors++;
            }
            if (data14.at === void 0) {
              const err46 = { instancePath: instancePath + "/infrastructure/" + i1, schemaPath: "#/$defs/RunInfrastructure/required", keyword: "required", params: { missingProperty: "at" }, message: "must have required property 'at'" };
              if (vErrors === null) {
                vErrors = [err46];
              } else {
                vErrors.push(err46);
              }
              errors++;
            }
            for (const key2 in data14) {
              if (!(key2 === "facility" || key2 === "room" || key2 === "operators" || key2 === "staffingStatus" || key2 === "product" || key2 === "message" || key2 === "at")) {
                const err47 = { instancePath: instancePath + "/infrastructure/" + i1, schemaPath: "#/$defs/RunInfrastructure/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err47];
                } else {
                  vErrors.push(err47);
                }
                errors++;
              }
            }
            if (data14.facility !== void 0) {
              let data15 = data14.facility;
              if (typeof data15 === "string") {
                if (func3(data15) > 80) {
                  const err48 = { instancePath: instancePath + "/infrastructure/" + i1 + "/facility", schemaPath: "#/$defs/RunInfrastructure/properties/facility/maxLength", keyword: "maxLength", params: { limit: 80 }, message: "must NOT have more than 80 characters" };
                  if (vErrors === null) {
                    vErrors = [err48];
                  } else {
                    vErrors.push(err48);
                  }
                  errors++;
                }
              } else {
                const err49 = { instancePath: instancePath + "/infrastructure/" + i1 + "/facility", schemaPath: "#/$defs/RunInfrastructure/properties/facility/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err49];
                } else {
                  vErrors.push(err49);
                }
                errors++;
              }
            }
            if (data14.room !== void 0) {
              let data16 = data14.room;
              if (!(typeof data16 == "number" && (!(data16 % 1) && !isNaN(data16)) && isFinite(data16))) {
                const err50 = { instancePath: instancePath + "/infrastructure/" + i1 + "/room", schemaPath: "#/$defs/RunInfrastructure/properties/room/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err50];
                } else {
                  vErrors.push(err50);
                }
                errors++;
              }
              if (typeof data16 == "number" && isFinite(data16)) {
                if (data16 > 100 || isNaN(data16)) {
                  const err51 = { instancePath: instancePath + "/infrastructure/" + i1 + "/room", schemaPath: "#/$defs/RunInfrastructure/properties/room/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
                  if (vErrors === null) {
                    vErrors = [err51];
                  } else {
                    vErrors.push(err51);
                  }
                  errors++;
                }
                if (data16 < 0 || isNaN(data16)) {
                  const err52 = { instancePath: instancePath + "/infrastructure/" + i1 + "/room", schemaPath: "#/$defs/RunInfrastructure/properties/room/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err52];
                  } else {
                    vErrors.push(err52);
                  }
                  errors++;
                }
              }
            }
            if (data14.operators !== void 0) {
              let data17 = data14.operators;
              if (Array.isArray(data17)) {
                if (data17.length > 20) {
                  const err53 = { instancePath: instancePath + "/infrastructure/" + i1 + "/operators", schemaPath: "#/$defs/RunInfrastructure/properties/operators/maxItems", keyword: "maxItems", params: { limit: 20 }, message: "must NOT have more than 20 items" };
                  if (vErrors === null) {
                    vErrors = [err53];
                  } else {
                    vErrors.push(err53);
                  }
                  errors++;
                }
                const len2 = data17.length;
                for (let i2 = 0; i2 < len2; i2++) {
                  let data18 = data17[i2];
                  if (typeof data18 === "string") {
                    if (func3(data18) > 80) {
                      const err54 = { instancePath: instancePath + "/infrastructure/" + i1 + "/operators/" + i2, schemaPath: "#/$defs/RunInfrastructure/properties/operators/items/maxLength", keyword: "maxLength", params: { limit: 80 }, message: "must NOT have more than 80 characters" };
                      if (vErrors === null) {
                        vErrors = [err54];
                      } else {
                        vErrors.push(err54);
                      }
                      errors++;
                    }
                  } else {
                    const err55 = { instancePath: instancePath + "/infrastructure/" + i1 + "/operators/" + i2, schemaPath: "#/$defs/RunInfrastructure/properties/operators/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err55];
                    } else {
                      vErrors.push(err55);
                    }
                    errors++;
                  }
                }
              } else {
                const err56 = { instancePath: instancePath + "/infrastructure/" + i1 + "/operators", schemaPath: "#/$defs/RunInfrastructure/properties/operators/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err56];
                } else {
                  vErrors.push(err56);
                }
                errors++;
              }
            }
            if (data14.staffingStatus !== void 0) {
              let data19 = data14.staffingStatus;
              if (!(data19 === "planned" || data19 === "confirmed" || data19 === "unavailable")) {
                const err57 = { instancePath: instancePath + "/infrastructure/" + i1 + "/staffingStatus", schemaPath: "#/$defs/RunInfrastructure/properties/staffingStatus/enum", keyword: "enum", params: { allowedValues: schema20.properties.staffingStatus.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err57];
                } else {
                  vErrors.push(err57);
                }
                errors++;
              }
            }
            if (data14.product !== void 0) {
              let data20 = data14.product;
              if (typeof data20 === "string") {
                if (func3(data20) > 200) {
                  const err58 = { instancePath: instancePath + "/infrastructure/" + i1 + "/product", schemaPath: "#/$defs/RunInfrastructure/properties/product/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                  if (vErrors === null) {
                    vErrors = [err58];
                  } else {
                    vErrors.push(err58);
                  }
                  errors++;
                }
              } else {
                const err59 = { instancePath: instancePath + "/infrastructure/" + i1 + "/product", schemaPath: "#/$defs/RunInfrastructure/properties/product/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err59];
                } else {
                  vErrors.push(err59);
                }
                errors++;
              }
            }
            if (data14.message !== void 0) {
              let data21 = data14.message;
              if (typeof data21 === "string") {
                if (func3(data21) > 500) {
                  const err60 = { instancePath: instancePath + "/infrastructure/" + i1 + "/message", schemaPath: "#/$defs/RunInfrastructure/properties/message/maxLength", keyword: "maxLength", params: { limit: 500 }, message: "must NOT have more than 500 characters" };
                  if (vErrors === null) {
                    vErrors = [err60];
                  } else {
                    vErrors.push(err60);
                  }
                  errors++;
                }
              } else {
                const err61 = { instancePath: instancePath + "/infrastructure/" + i1 + "/message", schemaPath: "#/$defs/RunInfrastructure/properties/message/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err61];
                } else {
                  vErrors.push(err61);
                }
                errors++;
              }
            }
            if (data14.at !== void 0) {
              if (typeof data14.at !== "string") {
                const err62 = { instancePath: instancePath + "/infrastructure/" + i1 + "/at", schemaPath: "#/$defs/RunInfrastructure/properties/at/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err62];
                } else {
                  vErrors.push(err62);
                }
                errors++;
              }
            }
          } else {
            const err63 = { instancePath: instancePath + "/infrastructure/" + i1, schemaPath: "#/$defs/RunInfrastructure/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err63];
            } else {
              vErrors.push(err63);
            }
            errors++;
          }
        }
      } else {
        const err64 = { instancePath: instancePath + "/infrastructure", schemaPath: "#/properties/infrastructure/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err64];
        } else {
          vErrors.push(err64);
        }
        errors++;
      }
    }
    if (data.artifacts !== void 0) {
      let data23 = data.artifacts;
      if (Array.isArray(data23)) {
        if (data23.length > 3) {
          const err65 = { instancePath: instancePath + "/artifacts", schemaPath: "#/properties/artifacts/maxItems", keyword: "maxItems", params: { limit: 3 }, message: "must NOT have more than 3 items" };
          if (vErrors === null) {
            vErrors = [err65];
          } else {
            vErrors.push(err65);
          }
          errors++;
        }
        const len3 = data23.length;
        for (let i3 = 0; i3 < len3; i3++) {
          let data24 = data23[i3];
          if (data24 && typeof data24 == "object" && !Array.isArray(data24)) {
            if (data24.id === void 0) {
              const err66 = { instancePath: instancePath + "/artifacts/" + i3, schemaPath: "#/$defs/RunArtifact/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
              if (vErrors === null) {
                vErrors = [err66];
              } else {
                vErrors.push(err66);
              }
              errors++;
            }
            if (data24.kind === void 0) {
              const err67 = { instancePath: instancePath + "/artifacts/" + i3, schemaPath: "#/$defs/RunArtifact/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
              if (vErrors === null) {
                vErrors = [err67];
              } else {
                vErrors.push(err67);
              }
              errors++;
            }
            if (data24.label === void 0) {
              const err68 = { instancePath: instancePath + "/artifacts/" + i3, schemaPath: "#/$defs/RunArtifact/required", keyword: "required", params: { missingProperty: "label" }, message: "must have required property 'label'" };
              if (vErrors === null) {
                vErrors = [err68];
              } else {
                vErrors.push(err68);
              }
              errors++;
            }
            if (data24.capturedAt === void 0) {
              const err69 = { instancePath: instancePath + "/artifacts/" + i3, schemaPath: "#/$defs/RunArtifact/required", keyword: "required", params: { missingProperty: "capturedAt" }, message: "must have required property 'capturedAt'" };
              if (vErrors === null) {
                vErrors = [err69];
              } else {
                vErrors.push(err69);
              }
              errors++;
            }
            if (data24.width === void 0) {
              const err70 = { instancePath: instancePath + "/artifacts/" + i3, schemaPath: "#/$defs/RunArtifact/required", keyword: "required", params: { missingProperty: "width" }, message: "must have required property 'width'" };
              if (vErrors === null) {
                vErrors = [err70];
              } else {
                vErrors.push(err70);
              }
              errors++;
            }
            if (data24.height === void 0) {
              const err71 = { instancePath: instancePath + "/artifacts/" + i3, schemaPath: "#/$defs/RunArtifact/required", keyword: "required", params: { missingProperty: "height" }, message: "must have required property 'height'" };
              if (vErrors === null) {
                vErrors = [err71];
              } else {
                vErrors.push(err71);
              }
              errors++;
            }
            for (const key3 in data24) {
              if (!(key3 === "id" || key3 === "kind" || key3 === "label" || key3 === "capturedAt" || key3 === "width" || key3 === "height")) {
                const err72 = { instancePath: instancePath + "/artifacts/" + i3, schemaPath: "#/$defs/RunArtifact/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err72];
                } else {
                  vErrors.push(err72);
                }
                errors++;
              }
            }
            if (data24.id !== void 0) {
              let data25 = data24.id;
              if (typeof data25 === "string") {
                if (!pattern0.test(data25)) {
                  const err73 = { instancePath: instancePath + "/artifacts/" + i3 + "/id", schemaPath: "#/$defs/RunArtifact/properties/id/pattern", keyword: "pattern", params: { pattern: "^[a-f0-9-]{36}$" }, message: 'must match pattern "^[a-f0-9-]{36}$"' };
                  if (vErrors === null) {
                    vErrors = [err73];
                  } else {
                    vErrors.push(err73);
                  }
                  errors++;
                }
              } else {
                const err74 = { instancePath: instancePath + "/artifacts/" + i3 + "/id", schemaPath: "#/$defs/RunArtifact/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err74];
                } else {
                  vErrors.push(err74);
                }
                errors++;
              }
            }
            if (data24.kind !== void 0) {
              if ("screenshot" !== data24.kind) {
                const err75 = { instancePath: instancePath + "/artifacts/" + i3 + "/kind", schemaPath: "#/$defs/RunArtifact/properties/kind/const", keyword: "const", params: { allowedValue: "screenshot" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err75];
                } else {
                  vErrors.push(err75);
                }
                errors++;
              }
            }
            if (data24.label !== void 0) {
              let data27 = data24.label;
              if (typeof data27 === "string") {
                if (func3(data27) > 100) {
                  const err76 = { instancePath: instancePath + "/artifacts/" + i3 + "/label", schemaPath: "#/$defs/RunArtifact/properties/label/maxLength", keyword: "maxLength", params: { limit: 100 }, message: "must NOT have more than 100 characters" };
                  if (vErrors === null) {
                    vErrors = [err76];
                  } else {
                    vErrors.push(err76);
                  }
                  errors++;
                }
              } else {
                const err77 = { instancePath: instancePath + "/artifacts/" + i3 + "/label", schemaPath: "#/$defs/RunArtifact/properties/label/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err77];
                } else {
                  vErrors.push(err77);
                }
                errors++;
              }
            }
            if (data24.capturedAt !== void 0) {
              if (typeof data24.capturedAt !== "string") {
                const err78 = { instancePath: instancePath + "/artifacts/" + i3 + "/capturedAt", schemaPath: "#/$defs/RunArtifact/properties/capturedAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err78];
                } else {
                  vErrors.push(err78);
                }
                errors++;
              }
            }
            if (data24.width !== void 0) {
              let data29 = data24.width;
              if (!(typeof data29 == "number" && (!(data29 % 1) && !isNaN(data29)) && isFinite(data29))) {
                const err79 = { instancePath: instancePath + "/artifacts/" + i3 + "/width", schemaPath: "#/$defs/RunArtifact/properties/width/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err79];
                } else {
                  vErrors.push(err79);
                }
                errors++;
              }
              if (typeof data29 == "number" && isFinite(data29)) {
                if (data29 > 8192 || isNaN(data29)) {
                  const err80 = { instancePath: instancePath + "/artifacts/" + i3 + "/width", schemaPath: "#/$defs/RunArtifact/properties/width/maximum", keyword: "maximum", params: { comparison: "<=", limit: 8192 }, message: "must be <= 8192" };
                  if (vErrors === null) {
                    vErrors = [err80];
                  } else {
                    vErrors.push(err80);
                  }
                  errors++;
                }
                if (data29 < 1 || isNaN(data29)) {
                  const err81 = { instancePath: instancePath + "/artifacts/" + i3 + "/width", schemaPath: "#/$defs/RunArtifact/properties/width/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                  if (vErrors === null) {
                    vErrors = [err81];
                  } else {
                    vErrors.push(err81);
                  }
                  errors++;
                }
              }
            }
            if (data24.height !== void 0) {
              let data30 = data24.height;
              if (!(typeof data30 == "number" && (!(data30 % 1) && !isNaN(data30)) && isFinite(data30))) {
                const err82 = { instancePath: instancePath + "/artifacts/" + i3 + "/height", schemaPath: "#/$defs/RunArtifact/properties/height/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err82];
                } else {
                  vErrors.push(err82);
                }
                errors++;
              }
              if (typeof data30 == "number" && isFinite(data30)) {
                if (data30 > 8192 || isNaN(data30)) {
                  const err83 = { instancePath: instancePath + "/artifacts/" + i3 + "/height", schemaPath: "#/$defs/RunArtifact/properties/height/maximum", keyword: "maximum", params: { comparison: "<=", limit: 8192 }, message: "must be <= 8192" };
                  if (vErrors === null) {
                    vErrors = [err83];
                  } else {
                    vErrors.push(err83);
                  }
                  errors++;
                }
                if (data30 < 1 || isNaN(data30)) {
                  const err84 = { instancePath: instancePath + "/artifacts/" + i3 + "/height", schemaPath: "#/$defs/RunArtifact/properties/height/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                  if (vErrors === null) {
                    vErrors = [err84];
                  } else {
                    vErrors.push(err84);
                  }
                  errors++;
                }
              }
            }
          } else {
            const err85 = { instancePath: instancePath + "/artifacts/" + i3, schemaPath: "#/$defs/RunArtifact/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err85];
            } else {
              vErrors.push(err85);
            }
            errors++;
          }
        }
      } else {
        const err86 = { instancePath: instancePath + "/artifacts", schemaPath: "#/properties/artifacts/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err86];
        } else {
          vErrors.push(err86);
        }
        errors++;
      }
    }
  } else {
    const err87 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err87];
    } else {
      vErrors.push(err87);
    }
    errors++;
  }
  validate16.errors = vErrors;
  return errors === 0;
}
function validate15(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.id === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.planId === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "planId" }, message: "must have required property 'planId'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.deviceId === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "deviceId" }, message: "must have required property 'deviceId'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.status === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.progress === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "progress" }, message: "must have required property 'progress'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.message === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "message" }, message: "must have required property 'message'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.startedAt === void 0) {
      const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "startedAt" }, message: "must have required property 'startedAt'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.finishedAt === void 0) {
      const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "finishedAt" }, message: "must have required property 'finishedAt'" };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func2.call(schema17.properties, key0)) {
        const err8 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.planName !== void 0) {
      let data0 = data.planName;
      if (typeof data0 === "string") {
        if (func3(data0) > 80) {
          const err9 = { instancePath: instancePath + "/planName", schemaPath: "#/properties/planName/maxLength", keyword: "maxLength", params: { limit: 80 }, message: "must NOT have more than 80 characters" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      } else {
        const err10 = { instancePath: instancePath + "/planName", schemaPath: "#/properties/planName/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.tasks !== void 0) {
      let data1 = data.tasks;
      if (Array.isArray(data1)) {
        if (data1.length > 30) {
          const err11 = { instancePath: instancePath + "/tasks", schemaPath: "#/properties/tasks/maxItems", keyword: "maxItems", params: { limit: 30 }, message: "must NOT have more than 30 items" };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
        const len0 = data1.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (!validate16(data1[i0], { instancePath: instancePath + "/tasks/" + i0, parentData: data1, parentDataProperty: i0, rootData })) {
            vErrors = vErrors === null ? validate16.errors : vErrors.concat(validate16.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err12 = { instancePath: instancePath + "/tasks", schemaPath: "#/properties/tasks/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.id !== void 0) {
      if (typeof data.id !== "string") {
        const err13 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
    if (data.planId !== void 0) {
      if (typeof data.planId !== "string") {
        const err14 = { instancePath: instancePath + "/planId", schemaPath: "#/properties/planId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    if (data.deviceId !== void 0) {
      if (typeof data.deviceId !== "string") {
        const err15 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.status !== void 0) {
      let data6 = data.status;
      if (typeof data6 !== "string") {
        const err16 = { instancePath: instancePath + "/status", schemaPath: "#/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
      if (!(data6 === "running" || data6 === "completed" || data6 === "failed" || data6 === "stopped")) {
        const err17 = { instancePath: instancePath + "/status", schemaPath: "#/properties/status/enum", keyword: "enum", params: { allowedValues: schema17.properties.status.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
    if (data.progress !== void 0) {
      let data7 = data.progress;
      if (!(typeof data7 == "number" && (!(data7 % 1) && !isNaN(data7)) && isFinite(data7))) {
        const err18 = { instancePath: instancePath + "/progress", schemaPath: "#/properties/progress/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
      if (typeof data7 == "number" && isFinite(data7)) {
        if (data7 > 100 || isNaN(data7)) {
          const err19 = { instancePath: instancePath + "/progress", schemaPath: "#/properties/progress/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
        if (data7 < 0 || isNaN(data7)) {
          const err20 = { instancePath: instancePath + "/progress", schemaPath: "#/properties/progress/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
      }
    }
    if (data.message !== void 0) {
      if (typeof data.message !== "string") {
        const err21 = { instancePath: instancePath + "/message", schemaPath: "#/properties/message/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
        }
        errors++;
      }
    }
    if (data.startedAt !== void 0) {
      if (typeof data.startedAt !== "string") {
        const err22 = { instancePath: instancePath + "/startedAt", schemaPath: "#/properties/startedAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
    }
    if (data.finishedAt !== void 0) {
      let data10 = data.finishedAt;
      const _errs22 = errors;
      let valid3 = false;
      const _errs23 = errors;
      if (typeof data10 !== "string") {
        const err23 = { instancePath: instancePath + "/finishedAt", schemaPath: "#/properties/finishedAt/anyOf/0/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
        }
        errors++;
      }
      var _valid0 = _errs23 === errors;
      valid3 = valid3 || _valid0;
      if (!valid3) {
        const _errs25 = errors;
        if (data10 !== null) {
          const err24 = { instancePath: instancePath + "/finishedAt", schemaPath: "#/properties/finishedAt/anyOf/1/type", keyword: "type", params: { type: "null" }, message: "must be null" };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
        var _valid0 = _errs25 === errors;
        valid3 = valid3 || _valid0;
      }
      if (!valid3) {
        const err25 = { instancePath: instancePath + "/finishedAt", schemaPath: "#/properties/finishedAt/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      } else {
        errors = _errs22;
        if (vErrors !== null) {
          if (_errs22) {
            vErrors.length = _errs22;
          } else {
            vErrors = null;
          }
        }
      }
    }
  } else {
    const err26 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err26];
    } else {
      vErrors.push(err26);
    }
    errors++;
  }
  validate15.errors = vErrors;
  return errors === 0;
}
var schema22 = { "additionalProperties": false, "properties": { "installDirectory": { "type": "string", "maxLength": 4096 }, "resourceActivities": { "type": "array", "maxItems": 6, "items": { "$ref": "#/$defs/ResourceActivityVersion" } }, "id": { "enum": ["app", "core", "resource"], "title": "Id", "type": "string" }, "currentVersion": { "title": "Currentversion", "type": "string" }, "latestVersion": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Latestversion" }, "status": { "default": "idle", "enum": ["idle", "checking", "available", "downloading", "staged", "waiting_idle", "active", "failed"], "title": "Status", "type": "string" }, "progress": { "default": 0, "maximum": 100, "minimum": 0, "title": "Progress", "type": "integer" }, "message": { "default": "", "title": "Message", "type": "string" } }, "required": ["id", "currentVersion", "latestVersion", "status", "progress", "message"], "title": "UpdateChannel", "type": "object" };
var schema23 = { "type": "object", "additionalProperties": false, "required": ["clientType", "name", "lastUpdated"], "properties": { "clientType": { "enum": ["Official", "Bilibili", "YoStarEN", "YoStarJP", "YoStarKR", "txwy"] }, "name": { "type": ["string", "null"], "maxLength": 300 }, "lastUpdated": { "type": ["string", "null"], "maxLength": 200 } } };
function validate19(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.id === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.currentVersion === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "currentVersion" }, message: "must have required property 'currentVersion'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.latestVersion === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "latestVersion" }, message: "must have required property 'latestVersion'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.status === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.progress === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "progress" }, message: "must have required property 'progress'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.message === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "message" }, message: "must have required property 'message'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "installDirectory" || key0 === "resourceActivities" || key0 === "id" || key0 === "currentVersion" || key0 === "latestVersion" || key0 === "status" || key0 === "progress" || key0 === "message")) {
        const err6 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.installDirectory !== void 0) {
      let data0 = data.installDirectory;
      if (typeof data0 === "string") {
        if (func3(data0) > 4096) {
          const err7 = { instancePath: instancePath + "/installDirectory", schemaPath: "#/properties/installDirectory/maxLength", keyword: "maxLength", params: { limit: 4096 }, message: "must NOT have more than 4096 characters" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      } else {
        const err8 = { instancePath: instancePath + "/installDirectory", schemaPath: "#/properties/installDirectory/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.resourceActivities !== void 0) {
      let data1 = data.resourceActivities;
      if (Array.isArray(data1)) {
        if (data1.length > 6) {
          const err9 = { instancePath: instancePath + "/resourceActivities", schemaPath: "#/properties/resourceActivities/maxItems", keyword: "maxItems", params: { limit: 6 }, message: "must NOT have more than 6 items" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
        const len0 = data1.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data2 = data1[i0];
          if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
            if (data2.clientType === void 0) {
              const err10 = { instancePath: instancePath + "/resourceActivities/" + i0, schemaPath: "#/$defs/ResourceActivityVersion/required", keyword: "required", params: { missingProperty: "clientType" }, message: "must have required property 'clientType'" };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
            if (data2.name === void 0) {
              const err11 = { instancePath: instancePath + "/resourceActivities/" + i0, schemaPath: "#/$defs/ResourceActivityVersion/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
            if (data2.lastUpdated === void 0) {
              const err12 = { instancePath: instancePath + "/resourceActivities/" + i0, schemaPath: "#/$defs/ResourceActivityVersion/required", keyword: "required", params: { missingProperty: "lastUpdated" }, message: "must have required property 'lastUpdated'" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
            for (const key1 in data2) {
              if (!(key1 === "clientType" || key1 === "name" || key1 === "lastUpdated")) {
                const err13 = { instancePath: instancePath + "/resourceActivities/" + i0, schemaPath: "#/$defs/ResourceActivityVersion/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err13];
                } else {
                  vErrors.push(err13);
                }
                errors++;
              }
            }
            if (data2.clientType !== void 0) {
              let data3 = data2.clientType;
              if (!(data3 === "Official" || data3 === "Bilibili" || data3 === "YoStarEN" || data3 === "YoStarJP" || data3 === "YoStarKR" || data3 === "txwy")) {
                const err14 = { instancePath: instancePath + "/resourceActivities/" + i0 + "/clientType", schemaPath: "#/$defs/ResourceActivityVersion/properties/clientType/enum", keyword: "enum", params: { allowedValues: schema23.properties.clientType.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err14];
                } else {
                  vErrors.push(err14);
                }
                errors++;
              }
            }
            if (data2.name !== void 0) {
              let data4 = data2.name;
              if (typeof data4 !== "string" && data4 !== null) {
                const err15 = { instancePath: instancePath + "/resourceActivities/" + i0 + "/name", schemaPath: "#/$defs/ResourceActivityVersion/properties/name/type", keyword: "type", params: { type: schema23.properties.name.type }, message: "must be string,null" };
                if (vErrors === null) {
                  vErrors = [err15];
                } else {
                  vErrors.push(err15);
                }
                errors++;
              }
              if (typeof data4 === "string") {
                if (func3(data4) > 300) {
                  const err16 = { instancePath: instancePath + "/resourceActivities/" + i0 + "/name", schemaPath: "#/$defs/ResourceActivityVersion/properties/name/maxLength", keyword: "maxLength", params: { limit: 300 }, message: "must NOT have more than 300 characters" };
                  if (vErrors === null) {
                    vErrors = [err16];
                  } else {
                    vErrors.push(err16);
                  }
                  errors++;
                }
              }
            }
            if (data2.lastUpdated !== void 0) {
              let data5 = data2.lastUpdated;
              if (typeof data5 !== "string" && data5 !== null) {
                const err17 = { instancePath: instancePath + "/resourceActivities/" + i0 + "/lastUpdated", schemaPath: "#/$defs/ResourceActivityVersion/properties/lastUpdated/type", keyword: "type", params: { type: schema23.properties.lastUpdated.type }, message: "must be string,null" };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
              if (typeof data5 === "string") {
                if (func3(data5) > 200) {
                  const err18 = { instancePath: instancePath + "/resourceActivities/" + i0 + "/lastUpdated", schemaPath: "#/$defs/ResourceActivityVersion/properties/lastUpdated/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                  if (vErrors === null) {
                    vErrors = [err18];
                  } else {
                    vErrors.push(err18);
                  }
                  errors++;
                }
              }
            }
          } else {
            const err19 = { instancePath: instancePath + "/resourceActivities/" + i0, schemaPath: "#/$defs/ResourceActivityVersion/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
        }
      } else {
        const err20 = { instancePath: instancePath + "/resourceActivities", schemaPath: "#/properties/resourceActivities/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
    }
    if (data.id !== void 0) {
      let data6 = data.id;
      if (typeof data6 !== "string") {
        const err21 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
        }
        errors++;
      }
      if (!(data6 === "app" || data6 === "core" || data6 === "resource")) {
        const err22 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/enum", keyword: "enum", params: { allowedValues: schema22.properties.id.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
    }
    if (data.currentVersion !== void 0) {
      if (typeof data.currentVersion !== "string") {
        const err23 = { instancePath: instancePath + "/currentVersion", schemaPath: "#/properties/currentVersion/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
        }
        errors++;
      }
    }
    if (data.latestVersion !== void 0) {
      let data8 = data.latestVersion;
      const _errs20 = errors;
      let valid5 = false;
      const _errs21 = errors;
      if (typeof data8 !== "string") {
        const err24 = { instancePath: instancePath + "/latestVersion", schemaPath: "#/properties/latestVersion/anyOf/0/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
      var _valid0 = _errs21 === errors;
      valid5 = valid5 || _valid0;
      if (!valid5) {
        const _errs23 = errors;
        if (data8 !== null) {
          const err25 = { instancePath: instancePath + "/latestVersion", schemaPath: "#/properties/latestVersion/anyOf/1/type", keyword: "type", params: { type: "null" }, message: "must be null" };
          if (vErrors === null) {
            vErrors = [err25];
          } else {
            vErrors.push(err25);
          }
          errors++;
        }
        var _valid0 = _errs23 === errors;
        valid5 = valid5 || _valid0;
      }
      if (!valid5) {
        const err26 = { instancePath: instancePath + "/latestVersion", schemaPath: "#/properties/latestVersion/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err26];
        } else {
          vErrors.push(err26);
        }
        errors++;
      } else {
        errors = _errs20;
        if (vErrors !== null) {
          if (_errs20) {
            vErrors.length = _errs20;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.status !== void 0) {
      let data9 = data.status;
      if (typeof data9 !== "string") {
        const err27 = { instancePath: instancePath + "/status", schemaPath: "#/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err27];
        } else {
          vErrors.push(err27);
        }
        errors++;
      }
      if (!(data9 === "idle" || data9 === "checking" || data9 === "available" || data9 === "downloading" || data9 === "staged" || data9 === "waiting_idle" || data9 === "active" || data9 === "failed")) {
        const err28 = { instancePath: instancePath + "/status", schemaPath: "#/properties/status/enum", keyword: "enum", params: { allowedValues: schema22.properties.status.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err28];
        } else {
          vErrors.push(err28);
        }
        errors++;
      }
    }
    if (data.progress !== void 0) {
      let data10 = data.progress;
      if (!(typeof data10 == "number" && (!(data10 % 1) && !isNaN(data10)) && isFinite(data10))) {
        const err29 = { instancePath: instancePath + "/progress", schemaPath: "#/properties/progress/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err29];
        } else {
          vErrors.push(err29);
        }
        errors++;
      }
      if (typeof data10 == "number" && isFinite(data10)) {
        if (data10 > 100 || isNaN(data10)) {
          const err30 = { instancePath: instancePath + "/progress", schemaPath: "#/properties/progress/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
          if (vErrors === null) {
            vErrors = [err30];
          } else {
            vErrors.push(err30);
          }
          errors++;
        }
        if (data10 < 0 || isNaN(data10)) {
          const err31 = { instancePath: instancePath + "/progress", schemaPath: "#/properties/progress/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err31];
          } else {
            vErrors.push(err31);
          }
          errors++;
        }
      }
    }
    if (data.message !== void 0) {
      if (typeof data.message !== "string") {
        const err32 = { instancePath: instancePath + "/message", schemaPath: "#/properties/message/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err32];
        } else {
          vErrors.push(err32);
        }
        errors++;
      }
    }
  } else {
    const err33 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err33];
    } else {
      vErrors.push(err33);
    }
    errors++;
  }
  validate19.errors = vErrors;
  return errors === 0;
}
var schema24 = { "additionalProperties": false, "properties": { "componentPaths": { "$ref": "#/$defs/ComponentPaths" }, "componentDownload": { "$ref": "#/$defs/ComponentDownload" }, "infrastructureEstimates": { "type": "array", "maxItems": 100, "items": { "$ref": "#/$defs/InfrastructureEstimateProfile" } }, "capture": { "$ref": "#/$defs/CaptureSettings" }, "connection": { "$ref": "#/$defs/ConnectionSettings" }, "deviceProfiles": { "type": "array", "maxItems": 32, "items": { "$ref": "#/$defs/DeviceConnectionProfile" } }, "logRetentionDays": { "type": "integer", "enum": [0, 7, 14, 30], "default": 7, "description": "Log retention in days; zero disables automatic cleanup." }, "autoConnect": { "default": true, "title": "Autoconnect", "type": "boolean" }, "autoUpdateCore": { "default": true, "title": "Autoupdatecore", "type": "boolean" }, "autoUpdateResource": { "default": true, "title": "Autoupdateresource", "type": "boolean" }, "minimizeToTray": { "default": true, "title": "Minimizetotray", "type": "boolean" }, "theme": { "default": "system", "enum": ["dark", "light", "system"], "title": "Theme", "type": "string" }, "budgets": { "$ref": "#/$defs/Budgets" }, "model": { "$ref": "#/$defs/ModelSettings" } }, "required": ["autoConnect", "autoUpdateCore", "autoUpdateResource", "minimizeToTray", "theme", "budgets", "model"], "title": "Settings", "type": "object" };
var schema26 = { "description": "Component download engine. Empty aria2Path resolves aria2c from PATH; otherwise use an absolute executable path. Changes apply to subsequent downloads.", "type": "object", "additionalProperties": false, "required": ["engine", "aria2Path"], "properties": { "engine": { "type": "string", "enum": ["builtin", "aria2"] }, "aria2Path": { "type": "string", "maxLength": 4096 } } };
var schema29 = { "type": "object", "additionalProperties": false, "properties": { "method": { "type": "string", "enum": ["adb", "mumu", "ldplayer"], "default": "adb" }, "autoDetect": { "type": "boolean", "description": "\u8FDE\u63A5\u65F6\u81EA\u52A8\u8BC6\u522B\u6A21\u62DF\u5668\u5E76\u914D\u7F6E\u589E\u5F3A\u622A\u56FE\uFF1B\u7701\u7565\u65F6 adb \u4E3A\u81EA\u52A8\uFF0C\u5DF2\u6709\u589E\u5F3A\u622A\u56FE\u4E3A\u624B\u52A8\u3002" }, "emulatorPath": { "type": "string", "maxLength": 4096, "default": "" }, "instanceIndex": { "type": "integer", "minimum": 0, "maximum": 65535, "default": 0 }, "mumuTouch": { "type": "boolean", "default": false }, "mumuBridge": { "type": "boolean", "default": false } }, "required": ["method", "emulatorPath", "instanceIndex"] };
var schema30 = { "type": "object", "additionalProperties": false, "properties": { "adbPath": { "type": "string", "maxLength": 4096, "default": "" }, "address": { "type": "string", "maxLength": 128, "default": "" }, "config": { "type": "string", "enum": ["General", "BlueStacks", "MuMuEmulator12", "MuMuArm", "LDPlayer", "Nox", "XYAZ", "Compatible", "SecondResolution", "CompatMac", "CompatPOSIXShell", "Waydroid", "AVD", "Androws", "WSA"], "default": "General" }, "touchMode": { "type": "string", "enum": ["minitouch", "maatouch", "adb", "MaaFwAdb"], "default": "minitouch" }, "adbLite": { "type": "boolean", "default": false }, "clientType": { "type": "string", "enum": ["Official", "Bilibili", "YoStarEN", "YoStarJP", "YoStarKR", "txwy"], "default": "Official" } }, "required": ["adbPath", "address", "config", "touchMode", "adbLite", "clientType"] };
function validate22(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.deviceId === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "deviceId" }, message: "must have required property 'deviceId'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.lines === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "lines" }, message: "must have required property 'lines'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "deviceId" || key0 === "lines")) {
        const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.deviceId !== void 0) {
      let data0 = data.deviceId;
      if (typeof data0 === "string") {
        if (func3(data0) > 200) {
          const err3 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (func3(data0) < 1) {
          const err4 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      } else {
        const err5 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.lines !== void 0) {
      let data1 = data.lines;
      if (Array.isArray(data1)) {
        if (data1.length > 20) {
          const err6 = { instancePath: instancePath + "/lines", schemaPath: "#/properties/lines/maxItems", keyword: "maxItems", params: { limit: 20 }, message: "must NOT have more than 20 items" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        const len0 = data1.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data2 = data1[i0];
          if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
            if (data2.id === void 0) {
              const err7 = { instancePath: instancePath + "/lines/" + i0, schemaPath: "#/$defs/InfrastructureLine/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
            if (data2.name === void 0) {
              const err8 = { instancePath: instancePath + "/lines/" + i0, schemaPath: "#/$defs/InfrastructureLine/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
            if (data2.unit === void 0) {
              const err9 = { instancePath: instancePath + "/lines/" + i0, schemaPath: "#/$defs/InfrastructureLine/required", keyword: "required", params: { missingProperty: "unit" }, message: "must have required property 'unit'" };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
            if (data2.hourlyRate === void 0) {
              const err10 = { instancePath: instancePath + "/lines/" + i0, schemaPath: "#/$defs/InfrastructureLine/required", keyword: "required", params: { missingProperty: "hourlyRate" }, message: "must have required property 'hourlyRate'" };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
            if (data2.capacity === void 0) {
              const err11 = { instancePath: instancePath + "/lines/" + i0, schemaPath: "#/$defs/InfrastructureLine/required", keyword: "required", params: { missingProperty: "capacity" }, message: "must have required property 'capacity'" };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
            if (data2.lastCollectedAt === void 0) {
              const err12 = { instancePath: instancePath + "/lines/" + i0, schemaPath: "#/$defs/InfrastructureLine/required", keyword: "required", params: { missingProperty: "lastCollectedAt" }, message: "must have required property 'lastCollectedAt'" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
            for (const key1 in data2) {
              if (!(key1 === "id" || key1 === "name" || key1 === "unit" || key1 === "hourlyRate" || key1 === "capacity" || key1 === "lastCollectedAt")) {
                const err13 = { instancePath: instancePath + "/lines/" + i0, schemaPath: "#/$defs/InfrastructureLine/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err13];
                } else {
                  vErrors.push(err13);
                }
                errors++;
              }
            }
            if (data2.id !== void 0) {
              let data3 = data2.id;
              if (typeof data3 === "string") {
                if (func3(data3) > 100) {
                  const err14 = { instancePath: instancePath + "/lines/" + i0 + "/id", schemaPath: "#/$defs/InfrastructureLine/properties/id/maxLength", keyword: "maxLength", params: { limit: 100 }, message: "must NOT have more than 100 characters" };
                  if (vErrors === null) {
                    vErrors = [err14];
                  } else {
                    vErrors.push(err14);
                  }
                  errors++;
                }
                if (func3(data3) < 1) {
                  const err15 = { instancePath: instancePath + "/lines/" + i0 + "/id", schemaPath: "#/$defs/InfrastructureLine/properties/id/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err15];
                  } else {
                    vErrors.push(err15);
                  }
                  errors++;
                }
              } else {
                const err16 = { instancePath: instancePath + "/lines/" + i0 + "/id", schemaPath: "#/$defs/InfrastructureLine/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
            }
            if (data2.name !== void 0) {
              let data4 = data2.name;
              if (typeof data4 === "string") {
                if (func3(data4) > 80) {
                  const err17 = { instancePath: instancePath + "/lines/" + i0 + "/name", schemaPath: "#/$defs/InfrastructureLine/properties/name/maxLength", keyword: "maxLength", params: { limit: 80 }, message: "must NOT have more than 80 characters" };
                  if (vErrors === null) {
                    vErrors = [err17];
                  } else {
                    vErrors.push(err17);
                  }
                  errors++;
                }
                if (func3(data4) < 1) {
                  const err18 = { instancePath: instancePath + "/lines/" + i0 + "/name", schemaPath: "#/$defs/InfrastructureLine/properties/name/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err18];
                  } else {
                    vErrors.push(err18);
                  }
                  errors++;
                }
              } else {
                const err19 = { instancePath: instancePath + "/lines/" + i0 + "/name", schemaPath: "#/$defs/InfrastructureLine/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
              }
            }
            if (data2.unit !== void 0) {
              let data5 = data2.unit;
              if (typeof data5 === "string") {
                if (func3(data5) > 20) {
                  const err20 = { instancePath: instancePath + "/lines/" + i0 + "/unit", schemaPath: "#/$defs/InfrastructureLine/properties/unit/maxLength", keyword: "maxLength", params: { limit: 20 }, message: "must NOT have more than 20 characters" };
                  if (vErrors === null) {
                    vErrors = [err20];
                  } else {
                    vErrors.push(err20);
                  }
                  errors++;
                }
                if (func3(data5) < 1) {
                  const err21 = { instancePath: instancePath + "/lines/" + i0 + "/unit", schemaPath: "#/$defs/InfrastructureLine/properties/unit/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err21];
                  } else {
                    vErrors.push(err21);
                  }
                  errors++;
                }
              } else {
                const err22 = { instancePath: instancePath + "/lines/" + i0 + "/unit", schemaPath: "#/$defs/InfrastructureLine/properties/unit/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err22];
                } else {
                  vErrors.push(err22);
                }
                errors++;
              }
            }
            if (data2.hourlyRate !== void 0) {
              let data6 = data2.hourlyRate;
              if (typeof data6 == "number" && isFinite(data6)) {
                if (data6 > 1e9 || isNaN(data6)) {
                  const err23 = { instancePath: instancePath + "/lines/" + i0 + "/hourlyRate", schemaPath: "#/$defs/InfrastructureLine/properties/hourlyRate/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e9 }, message: "must be <= 1000000000" };
                  if (vErrors === null) {
                    vErrors = [err23];
                  } else {
                    vErrors.push(err23);
                  }
                  errors++;
                }
                if (data6 < 0 || isNaN(data6)) {
                  const err24 = { instancePath: instancePath + "/lines/" + i0 + "/hourlyRate", schemaPath: "#/$defs/InfrastructureLine/properties/hourlyRate/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err24];
                  } else {
                    vErrors.push(err24);
                  }
                  errors++;
                }
              } else {
                const err25 = { instancePath: instancePath + "/lines/" + i0 + "/hourlyRate", schemaPath: "#/$defs/InfrastructureLine/properties/hourlyRate/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err25];
                } else {
                  vErrors.push(err25);
                }
                errors++;
              }
            }
            if (data2.capacity !== void 0) {
              let data7 = data2.capacity;
              if (typeof data7 == "number" && isFinite(data7)) {
                if (data7 > 1e9 || isNaN(data7)) {
                  const err26 = { instancePath: instancePath + "/lines/" + i0 + "/capacity", schemaPath: "#/$defs/InfrastructureLine/properties/capacity/maximum", keyword: "maximum", params: { comparison: "<=", limit: 1e9 }, message: "must be <= 1000000000" };
                  if (vErrors === null) {
                    vErrors = [err26];
                  } else {
                    vErrors.push(err26);
                  }
                  errors++;
                }
                if (data7 <= 0 || isNaN(data7)) {
                  const err27 = { instancePath: instancePath + "/lines/" + i0 + "/capacity", schemaPath: "#/$defs/InfrastructureLine/properties/capacity/exclusiveMinimum", keyword: "exclusiveMinimum", params: { comparison: ">", limit: 0 }, message: "must be > 0" };
                  if (vErrors === null) {
                    vErrors = [err27];
                  } else {
                    vErrors.push(err27);
                  }
                  errors++;
                }
              } else {
                const err28 = { instancePath: instancePath + "/lines/" + i0 + "/capacity", schemaPath: "#/$defs/InfrastructureLine/properties/capacity/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                if (vErrors === null) {
                  vErrors = [err28];
                } else {
                  vErrors.push(err28);
                }
                errors++;
              }
            }
            if (data2.lastCollectedAt !== void 0) {
              let data8 = data2.lastCollectedAt;
              if (typeof data8 === "string") {
                if (func3(data8) > 40) {
                  const err29 = { instancePath: instancePath + "/lines/" + i0 + "/lastCollectedAt", schemaPath: "#/$defs/InfrastructureLine/properties/lastCollectedAt/maxLength", keyword: "maxLength", params: { limit: 40 }, message: "must NOT have more than 40 characters" };
                  if (vErrors === null) {
                    vErrors = [err29];
                  } else {
                    vErrors.push(err29);
                  }
                  errors++;
                }
                if (func3(data8) < 20) {
                  const err30 = { instancePath: instancePath + "/lines/" + i0 + "/lastCollectedAt", schemaPath: "#/$defs/InfrastructureLine/properties/lastCollectedAt/minLength", keyword: "minLength", params: { limit: 20 }, message: "must NOT have fewer than 20 characters" };
                  if (vErrors === null) {
                    vErrors = [err30];
                  } else {
                    vErrors.push(err30);
                  }
                  errors++;
                }
              } else {
                const err31 = { instancePath: instancePath + "/lines/" + i0 + "/lastCollectedAt", schemaPath: "#/$defs/InfrastructureLine/properties/lastCollectedAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err31];
                } else {
                  vErrors.push(err31);
                }
                errors++;
              }
            }
          } else {
            const err32 = { instancePath: instancePath + "/lines/" + i0, schemaPath: "#/$defs/InfrastructureLine/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err32];
            } else {
              vErrors.push(err32);
            }
            errors++;
          }
        }
      } else {
        const err33 = { instancePath: instancePath + "/lines", schemaPath: "#/properties/lines/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err33];
        } else {
          vErrors.push(err33);
        }
        errors++;
      }
    }
  } else {
    const err34 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err34];
    } else {
      vErrors.push(err34);
    }
    errors++;
  }
  validate22.errors = vErrors;
  return errors === 0;
}
var pattern1 = new RegExp("^[A-Za-z0-9_-]+$", "u");
function validate24(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.id === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.name === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.address === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "address" }, message: "must have required property 'address'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.connection === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "connection" }, message: "must have required property 'connection'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.capture === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "capture" }, message: "must have required property 'capture'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "id" || key0 === "autoDetected" || key0 === "name" || key0 === "address" || key0 === "connection" || key0 === "capture")) {
        const err5 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.id !== void 0) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (func3(data0) > 80) {
          const err6 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/maxLength", keyword: "maxLength", params: { limit: 80 }, message: "must NOT have more than 80 characters" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (func3(data0) < 1) {
          const err7 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (!pattern1.test(data0)) {
          const err8 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/pattern", keyword: "pattern", params: { pattern: "^[A-Za-z0-9_-]+$" }, message: 'must match pattern "^[A-Za-z0-9_-]+$"' };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      } else {
        const err9 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.autoDetected !== void 0) {
      if (typeof data.autoDetected !== "boolean") {
        const err10 = { instancePath: instancePath + "/autoDetected", schemaPath: "#/properties/autoDetected/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.name !== void 0) {
      let data2 = data.name;
      if (typeof data2 === "string") {
        if (func3(data2) > 80) {
          const err11 = { instancePath: instancePath + "/name", schemaPath: "#/properties/name/maxLength", keyword: "maxLength", params: { limit: 80 }, message: "must NOT have more than 80 characters" };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
        if (func3(data2) < 1) {
          const err12 = { instancePath: instancePath + "/name", schemaPath: "#/properties/name/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
      } else {
        const err13 = { instancePath: instancePath + "/name", schemaPath: "#/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
    if (data.address !== void 0) {
      let data3 = data.address;
      if (typeof data3 === "string") {
        if (func3(data3) > 128) {
          const err14 = { instancePath: instancePath + "/address", schemaPath: "#/properties/address/maxLength", keyword: "maxLength", params: { limit: 128 }, message: "must NOT have more than 128 characters" };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
        if (func3(data3) < 1) {
          const err15 = { instancePath: instancePath + "/address", schemaPath: "#/properties/address/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
      } else {
        const err16 = { instancePath: instancePath + "/address", schemaPath: "#/properties/address/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
    if (data.connection !== void 0) {
      let data4 = data.connection;
      if (data4 && typeof data4 == "object" && !Array.isArray(data4)) {
        if (data4.adbPath === void 0) {
          const err17 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/ConnectionSettings/required", keyword: "required", params: { missingProperty: "adbPath" }, message: "must have required property 'adbPath'" };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
        if (data4.address === void 0) {
          const err18 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/ConnectionSettings/required", keyword: "required", params: { missingProperty: "address" }, message: "must have required property 'address'" };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
        if (data4.config === void 0) {
          const err19 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/ConnectionSettings/required", keyword: "required", params: { missingProperty: "config" }, message: "must have required property 'config'" };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
        if (data4.touchMode === void 0) {
          const err20 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/ConnectionSettings/required", keyword: "required", params: { missingProperty: "touchMode" }, message: "must have required property 'touchMode'" };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
        if (data4.adbLite === void 0) {
          const err21 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/ConnectionSettings/required", keyword: "required", params: { missingProperty: "adbLite" }, message: "must have required property 'adbLite'" };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
        if (data4.clientType === void 0) {
          const err22 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/ConnectionSettings/required", keyword: "required", params: { missingProperty: "clientType" }, message: "must have required property 'clientType'" };
          if (vErrors === null) {
            vErrors = [err22];
          } else {
            vErrors.push(err22);
          }
          errors++;
        }
        for (const key1 in data4) {
          if (!(key1 === "adbPath" || key1 === "address" || key1 === "config" || key1 === "touchMode" || key1 === "adbLite" || key1 === "clientType")) {
            const err23 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/ConnectionSettings/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
        }
        if (data4.adbPath !== void 0) {
          let data5 = data4.adbPath;
          if (typeof data5 === "string") {
            if (func3(data5) > 4096) {
              const err24 = { instancePath: instancePath + "/connection/adbPath", schemaPath: "#/$defs/ConnectionSettings/properties/adbPath/maxLength", keyword: "maxLength", params: { limit: 4096 }, message: "must NOT have more than 4096 characters" };
              if (vErrors === null) {
                vErrors = [err24];
              } else {
                vErrors.push(err24);
              }
              errors++;
            }
          } else {
            const err25 = { instancePath: instancePath + "/connection/adbPath", schemaPath: "#/$defs/ConnectionSettings/properties/adbPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err25];
            } else {
              vErrors.push(err25);
            }
            errors++;
          }
        }
        if (data4.address !== void 0) {
          let data6 = data4.address;
          if (typeof data6 === "string") {
            if (func3(data6) > 128) {
              const err26 = { instancePath: instancePath + "/connection/address", schemaPath: "#/$defs/ConnectionSettings/properties/address/maxLength", keyword: "maxLength", params: { limit: 128 }, message: "must NOT have more than 128 characters" };
              if (vErrors === null) {
                vErrors = [err26];
              } else {
                vErrors.push(err26);
              }
              errors++;
            }
          } else {
            const err27 = { instancePath: instancePath + "/connection/address", schemaPath: "#/$defs/ConnectionSettings/properties/address/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err27];
            } else {
              vErrors.push(err27);
            }
            errors++;
          }
        }
        if (data4.config !== void 0) {
          let data7 = data4.config;
          if (typeof data7 !== "string") {
            const err28 = { instancePath: instancePath + "/connection/config", schemaPath: "#/$defs/ConnectionSettings/properties/config/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err28];
            } else {
              vErrors.push(err28);
            }
            errors++;
          }
          if (!(data7 === "General" || data7 === "BlueStacks" || data7 === "MuMuEmulator12" || data7 === "MuMuArm" || data7 === "LDPlayer" || data7 === "Nox" || data7 === "XYAZ" || data7 === "Compatible" || data7 === "SecondResolution" || data7 === "CompatMac" || data7 === "CompatPOSIXShell" || data7 === "Waydroid" || data7 === "AVD" || data7 === "Androws" || data7 === "WSA")) {
            const err29 = { instancePath: instancePath + "/connection/config", schemaPath: "#/$defs/ConnectionSettings/properties/config/enum", keyword: "enum", params: { allowedValues: schema30.properties.config.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err29];
            } else {
              vErrors.push(err29);
            }
            errors++;
          }
        }
        if (data4.touchMode !== void 0) {
          let data8 = data4.touchMode;
          if (typeof data8 !== "string") {
            const err30 = { instancePath: instancePath + "/connection/touchMode", schemaPath: "#/$defs/ConnectionSettings/properties/touchMode/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err30];
            } else {
              vErrors.push(err30);
            }
            errors++;
          }
          if (!(data8 === "minitouch" || data8 === "maatouch" || data8 === "adb" || data8 === "MaaFwAdb")) {
            const err31 = { instancePath: instancePath + "/connection/touchMode", schemaPath: "#/$defs/ConnectionSettings/properties/touchMode/enum", keyword: "enum", params: { allowedValues: schema30.properties.touchMode.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err31];
            } else {
              vErrors.push(err31);
            }
            errors++;
          }
        }
        if (data4.adbLite !== void 0) {
          if (typeof data4.adbLite !== "boolean") {
            const err32 = { instancePath: instancePath + "/connection/adbLite", schemaPath: "#/$defs/ConnectionSettings/properties/adbLite/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err32];
            } else {
              vErrors.push(err32);
            }
            errors++;
          }
        }
        if (data4.clientType !== void 0) {
          let data10 = data4.clientType;
          if (typeof data10 !== "string") {
            const err33 = { instancePath: instancePath + "/connection/clientType", schemaPath: "#/$defs/ConnectionSettings/properties/clientType/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err33];
            } else {
              vErrors.push(err33);
            }
            errors++;
          }
          if (!(data10 === "Official" || data10 === "Bilibili" || data10 === "YoStarEN" || data10 === "YoStarJP" || data10 === "YoStarKR" || data10 === "txwy")) {
            const err34 = { instancePath: instancePath + "/connection/clientType", schemaPath: "#/$defs/ConnectionSettings/properties/clientType/enum", keyword: "enum", params: { allowedValues: schema30.properties.clientType.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err34];
            } else {
              vErrors.push(err34);
            }
            errors++;
          }
        }
      } else {
        const err35 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/ConnectionSettings/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err35];
        } else {
          vErrors.push(err35);
        }
        errors++;
      }
    }
    if (data.capture !== void 0) {
      let data11 = data.capture;
      if (data11 && typeof data11 == "object" && !Array.isArray(data11)) {
        if (data11.method === void 0) {
          const err36 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/CaptureSettings/required", keyword: "required", params: { missingProperty: "method" }, message: "must have required property 'method'" };
          if (vErrors === null) {
            vErrors = [err36];
          } else {
            vErrors.push(err36);
          }
          errors++;
        }
        if (data11.emulatorPath === void 0) {
          const err37 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/CaptureSettings/required", keyword: "required", params: { missingProperty: "emulatorPath" }, message: "must have required property 'emulatorPath'" };
          if (vErrors === null) {
            vErrors = [err37];
          } else {
            vErrors.push(err37);
          }
          errors++;
        }
        if (data11.instanceIndex === void 0) {
          const err38 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/CaptureSettings/required", keyword: "required", params: { missingProperty: "instanceIndex" }, message: "must have required property 'instanceIndex'" };
          if (vErrors === null) {
            vErrors = [err38];
          } else {
            vErrors.push(err38);
          }
          errors++;
        }
        for (const key2 in data11) {
          if (!(key2 === "method" || key2 === "autoDetect" || key2 === "emulatorPath" || key2 === "instanceIndex" || key2 === "mumuTouch" || key2 === "mumuBridge")) {
            const err39 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/CaptureSettings/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err39];
            } else {
              vErrors.push(err39);
            }
            errors++;
          }
        }
        if (data11.method !== void 0) {
          let data12 = data11.method;
          if (typeof data12 !== "string") {
            const err40 = { instancePath: instancePath + "/capture/method", schemaPath: "#/$defs/CaptureSettings/properties/method/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err40];
            } else {
              vErrors.push(err40);
            }
            errors++;
          }
          if (!(data12 === "adb" || data12 === "mumu" || data12 === "ldplayer")) {
            const err41 = { instancePath: instancePath + "/capture/method", schemaPath: "#/$defs/CaptureSettings/properties/method/enum", keyword: "enum", params: { allowedValues: schema29.properties.method.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err41];
            } else {
              vErrors.push(err41);
            }
            errors++;
          }
        }
        if (data11.autoDetect !== void 0) {
          if (typeof data11.autoDetect !== "boolean") {
            const err42 = { instancePath: instancePath + "/capture/autoDetect", schemaPath: "#/$defs/CaptureSettings/properties/autoDetect/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err42];
            } else {
              vErrors.push(err42);
            }
            errors++;
          }
        }
        if (data11.emulatorPath !== void 0) {
          let data14 = data11.emulatorPath;
          if (typeof data14 === "string") {
            if (func3(data14) > 4096) {
              const err43 = { instancePath: instancePath + "/capture/emulatorPath", schemaPath: "#/$defs/CaptureSettings/properties/emulatorPath/maxLength", keyword: "maxLength", params: { limit: 4096 }, message: "must NOT have more than 4096 characters" };
              if (vErrors === null) {
                vErrors = [err43];
              } else {
                vErrors.push(err43);
              }
              errors++;
            }
          } else {
            const err44 = { instancePath: instancePath + "/capture/emulatorPath", schemaPath: "#/$defs/CaptureSettings/properties/emulatorPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err44];
            } else {
              vErrors.push(err44);
            }
            errors++;
          }
        }
        if (data11.instanceIndex !== void 0) {
          let data15 = data11.instanceIndex;
          if (!(typeof data15 == "number" && (!(data15 % 1) && !isNaN(data15)) && isFinite(data15))) {
            const err45 = { instancePath: instancePath + "/capture/instanceIndex", schemaPath: "#/$defs/CaptureSettings/properties/instanceIndex/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err45];
            } else {
              vErrors.push(err45);
            }
            errors++;
          }
          if (typeof data15 == "number" && isFinite(data15)) {
            if (data15 > 65535 || isNaN(data15)) {
              const err46 = { instancePath: instancePath + "/capture/instanceIndex", schemaPath: "#/$defs/CaptureSettings/properties/instanceIndex/maximum", keyword: "maximum", params: { comparison: "<=", limit: 65535 }, message: "must be <= 65535" };
              if (vErrors === null) {
                vErrors = [err46];
              } else {
                vErrors.push(err46);
              }
              errors++;
            }
            if (data15 < 0 || isNaN(data15)) {
              const err47 = { instancePath: instancePath + "/capture/instanceIndex", schemaPath: "#/$defs/CaptureSettings/properties/instanceIndex/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err47];
              } else {
                vErrors.push(err47);
              }
              errors++;
            }
          }
        }
        if (data11.mumuTouch !== void 0) {
          if (typeof data11.mumuTouch !== "boolean") {
            const err48 = { instancePath: instancePath + "/capture/mumuTouch", schemaPath: "#/$defs/CaptureSettings/properties/mumuTouch/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err48];
            } else {
              vErrors.push(err48);
            }
            errors++;
          }
        }
        if (data11.mumuBridge !== void 0) {
          if (typeof data11.mumuBridge !== "boolean") {
            const err49 = { instancePath: instancePath + "/capture/mumuBridge", schemaPath: "#/$defs/CaptureSettings/properties/mumuBridge/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err49];
            } else {
              vErrors.push(err49);
            }
            errors++;
          }
        }
      } else {
        const err50 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/CaptureSettings/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err50];
        } else {
          vErrors.push(err50);
        }
        errors++;
      }
    }
  } else {
    const err51 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err51];
    } else {
      vErrors.push(err51);
    }
    errors++;
  }
  validate24.errors = vErrors;
  return errors === 0;
}
function validate21(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.autoConnect === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "autoConnect" }, message: "must have required property 'autoConnect'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.autoUpdateCore === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "autoUpdateCore" }, message: "must have required property 'autoUpdateCore'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.autoUpdateResource === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "autoUpdateResource" }, message: "must have required property 'autoUpdateResource'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.minimizeToTray === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "minimizeToTray" }, message: "must have required property 'minimizeToTray'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.theme === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "theme" }, message: "must have required property 'theme'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.budgets === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "budgets" }, message: "must have required property 'budgets'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.model === void 0) {
      const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "model" }, message: "must have required property 'model'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func2.call(schema24.properties, key0)) {
        const err7 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.componentPaths !== void 0) {
      let data0 = data.componentPaths;
      if (data0 && typeof data0 == "object" && !Array.isArray(data0)) {
        if (data0.core === void 0) {
          const err8 = { instancePath: instancePath + "/componentPaths", schemaPath: "#/$defs/ComponentPaths/required", keyword: "required", params: { missingProperty: "core" }, message: "must have required property 'core'" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        if (data0.resource === void 0) {
          const err9 = { instancePath: instancePath + "/componentPaths", schemaPath: "#/$defs/ComponentPaths/required", keyword: "required", params: { missingProperty: "resource" }, message: "must have required property 'resource'" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
        for (const key1 in data0) {
          if (!(key1 === "core" || key1 === "resource")) {
            const err10 = { instancePath: instancePath + "/componentPaths", schemaPath: "#/$defs/ComponentPaths/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data0.core !== void 0) {
          let data1 = data0.core;
          if (typeof data1 === "string") {
            if (func3(data1) > 4096) {
              const err11 = { instancePath: instancePath + "/componentPaths/core", schemaPath: "#/$defs/ComponentPaths/properties/core/maxLength", keyword: "maxLength", params: { limit: 4096 }, message: "must NOT have more than 4096 characters" };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
          } else {
            const err12 = { instancePath: instancePath + "/componentPaths/core", schemaPath: "#/$defs/ComponentPaths/properties/core/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data0.resource !== void 0) {
          let data2 = data0.resource;
          if (typeof data2 === "string") {
            if (func3(data2) > 4096) {
              const err13 = { instancePath: instancePath + "/componentPaths/resource", schemaPath: "#/$defs/ComponentPaths/properties/resource/maxLength", keyword: "maxLength", params: { limit: 4096 }, message: "must NOT have more than 4096 characters" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          } else {
            const err14 = { instancePath: instancePath + "/componentPaths/resource", schemaPath: "#/$defs/ComponentPaths/properties/resource/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
      } else {
        const err15 = { instancePath: instancePath + "/componentPaths", schemaPath: "#/$defs/ComponentPaths/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.componentDownload !== void 0) {
      let data3 = data.componentDownload;
      if (data3 && typeof data3 == "object" && !Array.isArray(data3)) {
        if (data3.engine === void 0) {
          const err16 = { instancePath: instancePath + "/componentDownload", schemaPath: "#/$defs/ComponentDownload/required", keyword: "required", params: { missingProperty: "engine" }, message: "must have required property 'engine'" };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
        if (data3.aria2Path === void 0) {
          const err17 = { instancePath: instancePath + "/componentDownload", schemaPath: "#/$defs/ComponentDownload/required", keyword: "required", params: { missingProperty: "aria2Path" }, message: "must have required property 'aria2Path'" };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
        for (const key2 in data3) {
          if (!(key2 === "engine" || key2 === "aria2Path")) {
            const err18 = { instancePath: instancePath + "/componentDownload", schemaPath: "#/$defs/ComponentDownload/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
        }
        if (data3.engine !== void 0) {
          let data4 = data3.engine;
          if (typeof data4 !== "string") {
            const err19 = { instancePath: instancePath + "/componentDownload/engine", schemaPath: "#/$defs/ComponentDownload/properties/engine/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
          if (!(data4 === "builtin" || data4 === "aria2")) {
            const err20 = { instancePath: instancePath + "/componentDownload/engine", schemaPath: "#/$defs/ComponentDownload/properties/engine/enum", keyword: "enum", params: { allowedValues: schema26.properties.engine.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          }
        }
        if (data3.aria2Path !== void 0) {
          let data5 = data3.aria2Path;
          if (typeof data5 === "string") {
            if (func3(data5) > 4096) {
              const err21 = { instancePath: instancePath + "/componentDownload/aria2Path", schemaPath: "#/$defs/ComponentDownload/properties/aria2Path/maxLength", keyword: "maxLength", params: { limit: 4096 }, message: "must NOT have more than 4096 characters" };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
          } else {
            const err22 = { instancePath: instancePath + "/componentDownload/aria2Path", schemaPath: "#/$defs/ComponentDownload/properties/aria2Path/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
        }
      } else {
        const err23 = { instancePath: instancePath + "/componentDownload", schemaPath: "#/$defs/ComponentDownload/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
        }
        errors++;
      }
    }
    if (data.infrastructureEstimates !== void 0) {
      let data6 = data.infrastructureEstimates;
      if (Array.isArray(data6)) {
        if (data6.length > 100) {
          const err24 = { instancePath: instancePath + "/infrastructureEstimates", schemaPath: "#/properties/infrastructureEstimates/maxItems", keyword: "maxItems", params: { limit: 100 }, message: "must NOT have more than 100 items" };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
        const len0 = data6.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (!validate22(data6[i0], { instancePath: instancePath + "/infrastructureEstimates/" + i0, parentData: data6, parentDataProperty: i0, rootData })) {
            vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err25 = { instancePath: instancePath + "/infrastructureEstimates", schemaPath: "#/properties/infrastructureEstimates/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
    }
    if (data.capture !== void 0) {
      let data8 = data.capture;
      if (data8 && typeof data8 == "object" && !Array.isArray(data8)) {
        if (data8.method === void 0) {
          const err26 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/CaptureSettings/required", keyword: "required", params: { missingProperty: "method" }, message: "must have required property 'method'" };
          if (vErrors === null) {
            vErrors = [err26];
          } else {
            vErrors.push(err26);
          }
          errors++;
        }
        if (data8.emulatorPath === void 0) {
          const err27 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/CaptureSettings/required", keyword: "required", params: { missingProperty: "emulatorPath" }, message: "must have required property 'emulatorPath'" };
          if (vErrors === null) {
            vErrors = [err27];
          } else {
            vErrors.push(err27);
          }
          errors++;
        }
        if (data8.instanceIndex === void 0) {
          const err28 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/CaptureSettings/required", keyword: "required", params: { missingProperty: "instanceIndex" }, message: "must have required property 'instanceIndex'" };
          if (vErrors === null) {
            vErrors = [err28];
          } else {
            vErrors.push(err28);
          }
          errors++;
        }
        for (const key3 in data8) {
          if (!(key3 === "method" || key3 === "autoDetect" || key3 === "emulatorPath" || key3 === "instanceIndex" || key3 === "mumuTouch" || key3 === "mumuBridge")) {
            const err29 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/CaptureSettings/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err29];
            } else {
              vErrors.push(err29);
            }
            errors++;
          }
        }
        if (data8.method !== void 0) {
          let data9 = data8.method;
          if (typeof data9 !== "string") {
            const err30 = { instancePath: instancePath + "/capture/method", schemaPath: "#/$defs/CaptureSettings/properties/method/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err30];
            } else {
              vErrors.push(err30);
            }
            errors++;
          }
          if (!(data9 === "adb" || data9 === "mumu" || data9 === "ldplayer")) {
            const err31 = { instancePath: instancePath + "/capture/method", schemaPath: "#/$defs/CaptureSettings/properties/method/enum", keyword: "enum", params: { allowedValues: schema29.properties.method.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err31];
            } else {
              vErrors.push(err31);
            }
            errors++;
          }
        }
        if (data8.autoDetect !== void 0) {
          if (typeof data8.autoDetect !== "boolean") {
            const err32 = { instancePath: instancePath + "/capture/autoDetect", schemaPath: "#/$defs/CaptureSettings/properties/autoDetect/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err32];
            } else {
              vErrors.push(err32);
            }
            errors++;
          }
        }
        if (data8.emulatorPath !== void 0) {
          let data11 = data8.emulatorPath;
          if (typeof data11 === "string") {
            if (func3(data11) > 4096) {
              const err33 = { instancePath: instancePath + "/capture/emulatorPath", schemaPath: "#/$defs/CaptureSettings/properties/emulatorPath/maxLength", keyword: "maxLength", params: { limit: 4096 }, message: "must NOT have more than 4096 characters" };
              if (vErrors === null) {
                vErrors = [err33];
              } else {
                vErrors.push(err33);
              }
              errors++;
            }
          } else {
            const err34 = { instancePath: instancePath + "/capture/emulatorPath", schemaPath: "#/$defs/CaptureSettings/properties/emulatorPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err34];
            } else {
              vErrors.push(err34);
            }
            errors++;
          }
        }
        if (data8.instanceIndex !== void 0) {
          let data12 = data8.instanceIndex;
          if (!(typeof data12 == "number" && (!(data12 % 1) && !isNaN(data12)) && isFinite(data12))) {
            const err35 = { instancePath: instancePath + "/capture/instanceIndex", schemaPath: "#/$defs/CaptureSettings/properties/instanceIndex/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err35];
            } else {
              vErrors.push(err35);
            }
            errors++;
          }
          if (typeof data12 == "number" && isFinite(data12)) {
            if (data12 > 65535 || isNaN(data12)) {
              const err36 = { instancePath: instancePath + "/capture/instanceIndex", schemaPath: "#/$defs/CaptureSettings/properties/instanceIndex/maximum", keyword: "maximum", params: { comparison: "<=", limit: 65535 }, message: "must be <= 65535" };
              if (vErrors === null) {
                vErrors = [err36];
              } else {
                vErrors.push(err36);
              }
              errors++;
            }
            if (data12 < 0 || isNaN(data12)) {
              const err37 = { instancePath: instancePath + "/capture/instanceIndex", schemaPath: "#/$defs/CaptureSettings/properties/instanceIndex/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err37];
              } else {
                vErrors.push(err37);
              }
              errors++;
            }
          }
        }
        if (data8.mumuTouch !== void 0) {
          if (typeof data8.mumuTouch !== "boolean") {
            const err38 = { instancePath: instancePath + "/capture/mumuTouch", schemaPath: "#/$defs/CaptureSettings/properties/mumuTouch/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err38];
            } else {
              vErrors.push(err38);
            }
            errors++;
          }
        }
        if (data8.mumuBridge !== void 0) {
          if (typeof data8.mumuBridge !== "boolean") {
            const err39 = { instancePath: instancePath + "/capture/mumuBridge", schemaPath: "#/$defs/CaptureSettings/properties/mumuBridge/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err39];
            } else {
              vErrors.push(err39);
            }
            errors++;
          }
        }
      } else {
        const err40 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/CaptureSettings/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err40];
        } else {
          vErrors.push(err40);
        }
        errors++;
      }
    }
    if (data.connection !== void 0) {
      let data15 = data.connection;
      if (data15 && typeof data15 == "object" && !Array.isArray(data15)) {
        if (data15.adbPath === void 0) {
          const err41 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/ConnectionSettings/required", keyword: "required", params: { missingProperty: "adbPath" }, message: "must have required property 'adbPath'" };
          if (vErrors === null) {
            vErrors = [err41];
          } else {
            vErrors.push(err41);
          }
          errors++;
        }
        if (data15.address === void 0) {
          const err42 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/ConnectionSettings/required", keyword: "required", params: { missingProperty: "address" }, message: "must have required property 'address'" };
          if (vErrors === null) {
            vErrors = [err42];
          } else {
            vErrors.push(err42);
          }
          errors++;
        }
        if (data15.config === void 0) {
          const err43 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/ConnectionSettings/required", keyword: "required", params: { missingProperty: "config" }, message: "must have required property 'config'" };
          if (vErrors === null) {
            vErrors = [err43];
          } else {
            vErrors.push(err43);
          }
          errors++;
        }
        if (data15.touchMode === void 0) {
          const err44 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/ConnectionSettings/required", keyword: "required", params: { missingProperty: "touchMode" }, message: "must have required property 'touchMode'" };
          if (vErrors === null) {
            vErrors = [err44];
          } else {
            vErrors.push(err44);
          }
          errors++;
        }
        if (data15.adbLite === void 0) {
          const err45 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/ConnectionSettings/required", keyword: "required", params: { missingProperty: "adbLite" }, message: "must have required property 'adbLite'" };
          if (vErrors === null) {
            vErrors = [err45];
          } else {
            vErrors.push(err45);
          }
          errors++;
        }
        if (data15.clientType === void 0) {
          const err46 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/ConnectionSettings/required", keyword: "required", params: { missingProperty: "clientType" }, message: "must have required property 'clientType'" };
          if (vErrors === null) {
            vErrors = [err46];
          } else {
            vErrors.push(err46);
          }
          errors++;
        }
        for (const key4 in data15) {
          if (!(key4 === "adbPath" || key4 === "address" || key4 === "config" || key4 === "touchMode" || key4 === "adbLite" || key4 === "clientType")) {
            const err47 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/ConnectionSettings/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err47];
            } else {
              vErrors.push(err47);
            }
            errors++;
          }
        }
        if (data15.adbPath !== void 0) {
          let data16 = data15.adbPath;
          if (typeof data16 === "string") {
            if (func3(data16) > 4096) {
              const err48 = { instancePath: instancePath + "/connection/adbPath", schemaPath: "#/$defs/ConnectionSettings/properties/adbPath/maxLength", keyword: "maxLength", params: { limit: 4096 }, message: "must NOT have more than 4096 characters" };
              if (vErrors === null) {
                vErrors = [err48];
              } else {
                vErrors.push(err48);
              }
              errors++;
            }
          } else {
            const err49 = { instancePath: instancePath + "/connection/adbPath", schemaPath: "#/$defs/ConnectionSettings/properties/adbPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err49];
            } else {
              vErrors.push(err49);
            }
            errors++;
          }
        }
        if (data15.address !== void 0) {
          let data17 = data15.address;
          if (typeof data17 === "string") {
            if (func3(data17) > 128) {
              const err50 = { instancePath: instancePath + "/connection/address", schemaPath: "#/$defs/ConnectionSettings/properties/address/maxLength", keyword: "maxLength", params: { limit: 128 }, message: "must NOT have more than 128 characters" };
              if (vErrors === null) {
                vErrors = [err50];
              } else {
                vErrors.push(err50);
              }
              errors++;
            }
          } else {
            const err51 = { instancePath: instancePath + "/connection/address", schemaPath: "#/$defs/ConnectionSettings/properties/address/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err51];
            } else {
              vErrors.push(err51);
            }
            errors++;
          }
        }
        if (data15.config !== void 0) {
          let data18 = data15.config;
          if (typeof data18 !== "string") {
            const err52 = { instancePath: instancePath + "/connection/config", schemaPath: "#/$defs/ConnectionSettings/properties/config/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err52];
            } else {
              vErrors.push(err52);
            }
            errors++;
          }
          if (!(data18 === "General" || data18 === "BlueStacks" || data18 === "MuMuEmulator12" || data18 === "MuMuArm" || data18 === "LDPlayer" || data18 === "Nox" || data18 === "XYAZ" || data18 === "Compatible" || data18 === "SecondResolution" || data18 === "CompatMac" || data18 === "CompatPOSIXShell" || data18 === "Waydroid" || data18 === "AVD" || data18 === "Androws" || data18 === "WSA")) {
            const err53 = { instancePath: instancePath + "/connection/config", schemaPath: "#/$defs/ConnectionSettings/properties/config/enum", keyword: "enum", params: { allowedValues: schema30.properties.config.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err53];
            } else {
              vErrors.push(err53);
            }
            errors++;
          }
        }
        if (data15.touchMode !== void 0) {
          let data19 = data15.touchMode;
          if (typeof data19 !== "string") {
            const err54 = { instancePath: instancePath + "/connection/touchMode", schemaPath: "#/$defs/ConnectionSettings/properties/touchMode/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err54];
            } else {
              vErrors.push(err54);
            }
            errors++;
          }
          if (!(data19 === "minitouch" || data19 === "maatouch" || data19 === "adb" || data19 === "MaaFwAdb")) {
            const err55 = { instancePath: instancePath + "/connection/touchMode", schemaPath: "#/$defs/ConnectionSettings/properties/touchMode/enum", keyword: "enum", params: { allowedValues: schema30.properties.touchMode.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err55];
            } else {
              vErrors.push(err55);
            }
            errors++;
          }
        }
        if (data15.adbLite !== void 0) {
          if (typeof data15.adbLite !== "boolean") {
            const err56 = { instancePath: instancePath + "/connection/adbLite", schemaPath: "#/$defs/ConnectionSettings/properties/adbLite/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err56];
            } else {
              vErrors.push(err56);
            }
            errors++;
          }
        }
        if (data15.clientType !== void 0) {
          let data21 = data15.clientType;
          if (typeof data21 !== "string") {
            const err57 = { instancePath: instancePath + "/connection/clientType", schemaPath: "#/$defs/ConnectionSettings/properties/clientType/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err57];
            } else {
              vErrors.push(err57);
            }
            errors++;
          }
          if (!(data21 === "Official" || data21 === "Bilibili" || data21 === "YoStarEN" || data21 === "YoStarJP" || data21 === "YoStarKR" || data21 === "txwy")) {
            const err58 = { instancePath: instancePath + "/connection/clientType", schemaPath: "#/$defs/ConnectionSettings/properties/clientType/enum", keyword: "enum", params: { allowedValues: schema30.properties.clientType.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err58];
            } else {
              vErrors.push(err58);
            }
            errors++;
          }
        }
      } else {
        const err59 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/ConnectionSettings/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err59];
        } else {
          vErrors.push(err59);
        }
        errors++;
      }
    }
    if (data.deviceProfiles !== void 0) {
      let data22 = data.deviceProfiles;
      if (Array.isArray(data22)) {
        if (data22.length > 32) {
          const err60 = { instancePath: instancePath + "/deviceProfiles", schemaPath: "#/properties/deviceProfiles/maxItems", keyword: "maxItems", params: { limit: 32 }, message: "must NOT have more than 32 items" };
          if (vErrors === null) {
            vErrors = [err60];
          } else {
            vErrors.push(err60);
          }
          errors++;
        }
        const len1 = data22.length;
        for (let i1 = 0; i1 < len1; i1++) {
          if (!validate24(data22[i1], { instancePath: instancePath + "/deviceProfiles/" + i1, parentData: data22, parentDataProperty: i1, rootData })) {
            vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err61 = { instancePath: instancePath + "/deviceProfiles", schemaPath: "#/properties/deviceProfiles/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err61];
        } else {
          vErrors.push(err61);
        }
        errors++;
      }
    }
    if (data.logRetentionDays !== void 0) {
      let data24 = data.logRetentionDays;
      if (!(typeof data24 == "number" && (!(data24 % 1) && !isNaN(data24)) && isFinite(data24))) {
        const err62 = { instancePath: instancePath + "/logRetentionDays", schemaPath: "#/properties/logRetentionDays/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err62];
        } else {
          vErrors.push(err62);
        }
        errors++;
      }
      if (!(data24 === 0 || data24 === 7 || data24 === 14 || data24 === 30)) {
        const err63 = { instancePath: instancePath + "/logRetentionDays", schemaPath: "#/properties/logRetentionDays/enum", keyword: "enum", params: { allowedValues: schema24.properties.logRetentionDays.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err63];
        } else {
          vErrors.push(err63);
        }
        errors++;
      }
    }
    if (data.autoConnect !== void 0) {
      if (typeof data.autoConnect !== "boolean") {
        const err64 = { instancePath: instancePath + "/autoConnect", schemaPath: "#/properties/autoConnect/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err64];
        } else {
          vErrors.push(err64);
        }
        errors++;
      }
    }
    if (data.autoUpdateCore !== void 0) {
      if (typeof data.autoUpdateCore !== "boolean") {
        const err65 = { instancePath: instancePath + "/autoUpdateCore", schemaPath: "#/properties/autoUpdateCore/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err65];
        } else {
          vErrors.push(err65);
        }
        errors++;
      }
    }
    if (data.autoUpdateResource !== void 0) {
      if (typeof data.autoUpdateResource !== "boolean") {
        const err66 = { instancePath: instancePath + "/autoUpdateResource", schemaPath: "#/properties/autoUpdateResource/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err66];
        } else {
          vErrors.push(err66);
        }
        errors++;
      }
    }
    if (data.minimizeToTray !== void 0) {
      if (typeof data.minimizeToTray !== "boolean") {
        const err67 = { instancePath: instancePath + "/minimizeToTray", schemaPath: "#/properties/minimizeToTray/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err67];
        } else {
          vErrors.push(err67);
        }
        errors++;
      }
    }
    if (data.theme !== void 0) {
      let data29 = data.theme;
      if (typeof data29 !== "string") {
        const err68 = { instancePath: instancePath + "/theme", schemaPath: "#/properties/theme/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err68];
        } else {
          vErrors.push(err68);
        }
        errors++;
      }
      if (!(data29 === "dark" || data29 === "light" || data29 === "system")) {
        const err69 = { instancePath: instancePath + "/theme", schemaPath: "#/properties/theme/enum", keyword: "enum", params: { allowedValues: schema24.properties.theme.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err69];
        } else {
          vErrors.push(err69);
        }
        errors++;
      }
    }
    if (data.budgets !== void 0) {
      let data30 = data.budgets;
      if (data30 && typeof data30 == "object" && !Array.isArray(data30)) {
        if (data30.originium === void 0) {
          const err70 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/required", keyword: "required", params: { missingProperty: "originium" }, message: "must have required property 'originium'" };
          if (vErrors === null) {
            vErrors = [err70];
          } else {
            vErrors.push(err70);
          }
          errors++;
        }
        if (data30.medicine === void 0) {
          const err71 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/required", keyword: "required", params: { missingProperty: "medicine" }, message: "must have required property 'medicine'" };
          if (vErrors === null) {
            vErrors = [err71];
          } else {
            vErrors.push(err71);
          }
          errors++;
        }
        if (data30.expedited === void 0) {
          const err72 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/required", keyword: "required", params: { missingProperty: "expedited" }, message: "must have required property 'expedited'" };
          if (vErrors === null) {
            vErrors = [err72];
          } else {
            vErrors.push(err72);
          }
          errors++;
        }
        for (const key5 in data30) {
          if (!(key5 === "originium" || key5 === "medicine" || key5 === "expedited")) {
            const err73 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key5 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err73];
            } else {
              vErrors.push(err73);
            }
            errors++;
          }
        }
        if (data30.originium !== void 0) {
          let data31 = data30.originium;
          if (!(typeof data31 == "number" && (!(data31 % 1) && !isNaN(data31)) && isFinite(data31))) {
            const err74 = { instancePath: instancePath + "/budgets/originium", schemaPath: "#/$defs/Budgets/properties/originium/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err74];
            } else {
              vErrors.push(err74);
            }
            errors++;
          }
          if (typeof data31 == "number" && isFinite(data31)) {
            if (data31 > 100 || isNaN(data31)) {
              const err75 = { instancePath: instancePath + "/budgets/originium", schemaPath: "#/$defs/Budgets/properties/originium/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
              if (vErrors === null) {
                vErrors = [err75];
              } else {
                vErrors.push(err75);
              }
              errors++;
            }
            if (data31 < 0 || isNaN(data31)) {
              const err76 = { instancePath: instancePath + "/budgets/originium", schemaPath: "#/$defs/Budgets/properties/originium/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err76];
              } else {
                vErrors.push(err76);
              }
              errors++;
            }
          }
        }
        if (data30.medicine !== void 0) {
          let data32 = data30.medicine;
          if (!(typeof data32 == "number" && (!(data32 % 1) && !isNaN(data32)) && isFinite(data32))) {
            const err77 = { instancePath: instancePath + "/budgets/medicine", schemaPath: "#/$defs/Budgets/properties/medicine/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err77];
            } else {
              vErrors.push(err77);
            }
            errors++;
          }
          if (typeof data32 == "number" && isFinite(data32)) {
            if (data32 > 100 || isNaN(data32)) {
              const err78 = { instancePath: instancePath + "/budgets/medicine", schemaPath: "#/$defs/Budgets/properties/medicine/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
              if (vErrors === null) {
                vErrors = [err78];
              } else {
                vErrors.push(err78);
              }
              errors++;
            }
            if (data32 < 0 || isNaN(data32)) {
              const err79 = { instancePath: instancePath + "/budgets/medicine", schemaPath: "#/$defs/Budgets/properties/medicine/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err79];
              } else {
                vErrors.push(err79);
              }
              errors++;
            }
          }
        }
        if (data30.expedited !== void 0) {
          let data33 = data30.expedited;
          if (!(typeof data33 == "number" && (!(data33 % 1) && !isNaN(data33)) && isFinite(data33))) {
            const err80 = { instancePath: instancePath + "/budgets/expedited", schemaPath: "#/$defs/Budgets/properties/expedited/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err80];
            } else {
              vErrors.push(err80);
            }
            errors++;
          }
          if (typeof data33 == "number" && isFinite(data33)) {
            if (data33 > 100 || isNaN(data33)) {
              const err81 = { instancePath: instancePath + "/budgets/expedited", schemaPath: "#/$defs/Budgets/properties/expedited/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
              if (vErrors === null) {
                vErrors = [err81];
              } else {
                vErrors.push(err81);
              }
              errors++;
            }
            if (data33 < 0 || isNaN(data33)) {
              const err82 = { instancePath: instancePath + "/budgets/expedited", schemaPath: "#/$defs/Budgets/properties/expedited/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err82];
              } else {
                vErrors.push(err82);
              }
              errors++;
            }
          }
        }
      } else {
        const err83 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err83];
        } else {
          vErrors.push(err83);
        }
        errors++;
      }
    }
    if (data.model !== void 0) {
      let data34 = data.model;
      if (data34 && typeof data34 == "object" && !Array.isArray(data34)) {
        if (data34.provider === void 0) {
          const err84 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/required", keyword: "required", params: { missingProperty: "provider" }, message: "must have required property 'provider'" };
          if (vErrors === null) {
            vErrors = [err84];
          } else {
            vErrors.push(err84);
          }
          errors++;
        }
        if (data34.baseUrl === void 0) {
          const err85 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/required", keyword: "required", params: { missingProperty: "baseUrl" }, message: "must have required property 'baseUrl'" };
          if (vErrors === null) {
            vErrors = [err85];
          } else {
            vErrors.push(err85);
          }
          errors++;
        }
        if (data34.model === void 0) {
          const err86 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/required", keyword: "required", params: { missingProperty: "model" }, message: "must have required property 'model'" };
          if (vErrors === null) {
            vErrors = [err86];
          } else {
            vErrors.push(err86);
          }
          errors++;
        }
        for (const key6 in data34) {
          if (!(key6 === "provider" || key6 === "baseUrl" || key6 === "model")) {
            const err87 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key6 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err87];
            } else {
              vErrors.push(err87);
            }
            errors++;
          }
        }
        if (data34.provider !== void 0) {
          if (typeof data34.provider !== "string") {
            const err88 = { instancePath: instancePath + "/model/provider", schemaPath: "#/$defs/ModelSettings/properties/provider/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err88];
            } else {
              vErrors.push(err88);
            }
            errors++;
          }
        }
        if (data34.baseUrl !== void 0) {
          if (typeof data34.baseUrl !== "string") {
            const err89 = { instancePath: instancePath + "/model/baseUrl", schemaPath: "#/$defs/ModelSettings/properties/baseUrl/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err89];
            } else {
              vErrors.push(err89);
            }
            errors++;
          }
        }
        if (data34.model !== void 0) {
          if (typeof data34.model !== "string") {
            const err90 = { instancePath: instancePath + "/model/model", schemaPath: "#/$defs/ModelSettings/properties/model/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err90];
            } else {
              vErrors.push(err90);
            }
            errors++;
          }
        }
      } else {
        const err91 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err91];
        } else {
          vErrors.push(err91);
        }
        errors++;
      }
    }
  } else {
    const err92 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err92];
    } else {
      vErrors.push(err92);
    }
    errors++;
  }
  validate21.errors = vErrors;
  return errors === 0;
}
function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.mode === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "mode" }, message: "must have required property 'mode'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.devices === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "devices" }, message: "must have required property 'devices'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.plans === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "plans" }, message: "must have required property 'plans'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.runs === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "runs" }, message: "must have required property 'runs'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.updates === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "updates" }, message: "must have required property 'updates'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.settings === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "settings" }, message: "must have required property 'settings'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.events === void 0) {
      const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "events" }, message: "must have required property 'events'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "mode" || key0 === "devices" || key0 === "plans" || key0 === "runs" || key0 === "updates" || key0 === "settings" || key0 === "events")) {
        const err7 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.mode !== void 0) {
      let data0 = data.mode;
      if (typeof data0 !== "string") {
        const err8 = { instancePath: instancePath + "/mode", schemaPath: "#/properties/mode/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
      if (!(data0 === "native")) {
        const err9 = { instancePath: instancePath + "/mode", schemaPath: "#/properties/mode/enum", keyword: "enum", params: { allowedValues: schema11.properties.mode.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.devices !== void 0) {
      let data1 = data.devices;
      if (Array.isArray(data1)) {
        const len0 = data1.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (!validate11(data1[i0], { instancePath: instancePath + "/devices/" + i0, parentData: data1, parentDataProperty: i0, rootData })) {
            vErrors = vErrors === null ? validate11.errors : vErrors.concat(validate11.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err10 = { instancePath: instancePath + "/devices", schemaPath: "#/properties/devices/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.plans !== void 0) {
      let data3 = data.plans;
      if (Array.isArray(data3)) {
        const len1 = data3.length;
        for (let i1 = 0; i1 < len1; i1++) {
          if (!validate13(data3[i1], { instancePath: instancePath + "/plans/" + i1, parentData: data3, parentDataProperty: i1, rootData })) {
            vErrors = vErrors === null ? validate13.errors : vErrors.concat(validate13.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err11 = { instancePath: instancePath + "/plans", schemaPath: "#/properties/plans/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.runs !== void 0) {
      let data5 = data.runs;
      if (Array.isArray(data5)) {
        const len2 = data5.length;
        for (let i2 = 0; i2 < len2; i2++) {
          if (!validate15(data5[i2], { instancePath: instancePath + "/runs/" + i2, parentData: data5, parentDataProperty: i2, rootData })) {
            vErrors = vErrors === null ? validate15.errors : vErrors.concat(validate15.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err12 = { instancePath: instancePath + "/runs", schemaPath: "#/properties/runs/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.updates !== void 0) {
      let data7 = data.updates;
      if (Array.isArray(data7)) {
        const len3 = data7.length;
        for (let i3 = 0; i3 < len3; i3++) {
          if (!validate19(data7[i3], { instancePath: instancePath + "/updates/" + i3, parentData: data7, parentDataProperty: i3, rootData })) {
            vErrors = vErrors === null ? validate19.errors : vErrors.concat(validate19.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err13 = { instancePath: instancePath + "/updates", schemaPath: "#/properties/updates/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
    if (data.settings !== void 0) {
      if (!validate21(data.settings, { instancePath: instancePath + "/settings", parentData: data, parentDataProperty: "settings", rootData })) {
        vErrors = vErrors === null ? validate21.errors : vErrors.concat(validate21.errors);
        errors = vErrors.length;
      }
    }
    if (data.events !== void 0) {
      let data10 = data.events;
      if (Array.isArray(data10)) {
        const len4 = data10.length;
        for (let i4 = 0; i4 < len4; i4++) {
          let data11 = data10[i4];
          if (data11 && typeof data11 == "object" && !Array.isArray(data11)) {
            if (data11.id === void 0) {
              const err14 = { instancePath: instancePath + "/events/" + i4, schemaPath: "#/$defs/Event/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
            if (data11.type === void 0) {
              const err15 = { instancePath: instancePath + "/events/" + i4, schemaPath: "#/$defs/Event/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
            if (data11.message === void 0) {
              const err16 = { instancePath: instancePath + "/events/" + i4, schemaPath: "#/$defs/Event/required", keyword: "required", params: { missingProperty: "message" }, message: "must have required property 'message'" };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
            if (data11.createdAt === void 0) {
              const err17 = { instancePath: instancePath + "/events/" + i4, schemaPath: "#/$defs/Event/required", keyword: "required", params: { missingProperty: "createdAt" }, message: "must have required property 'createdAt'" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
            if (data11.data === void 0) {
              const err18 = { instancePath: instancePath + "/events/" + i4, schemaPath: "#/$defs/Event/required", keyword: "required", params: { missingProperty: "data" }, message: "must have required property 'data'" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
            for (const key1 in data11) {
              if (!(key1 === "id" || key1 === "type" || key1 === "message" || key1 === "createdAt" || key1 === "data")) {
                const err19 = { instancePath: instancePath + "/events/" + i4, schemaPath: "#/$defs/Event/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
              }
            }
            if (data11.id !== void 0) {
              let data12 = data11.id;
              if (!(typeof data12 == "number" && (!(data12 % 1) && !isNaN(data12)) && isFinite(data12))) {
                const err20 = { instancePath: instancePath + "/events/" + i4 + "/id", schemaPath: "#/$defs/Event/properties/id/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
            }
            if (data11.type !== void 0) {
              if (typeof data11.type !== "string") {
                const err21 = { instancePath: instancePath + "/events/" + i4 + "/type", schemaPath: "#/$defs/Event/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err21];
                } else {
                  vErrors.push(err21);
                }
                errors++;
              }
            }
            if (data11.message !== void 0) {
              if (typeof data11.message !== "string") {
                const err22 = { instancePath: instancePath + "/events/" + i4 + "/message", schemaPath: "#/$defs/Event/properties/message/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err22];
                } else {
                  vErrors.push(err22);
                }
                errors++;
              }
            }
            if (data11.createdAt !== void 0) {
              if (typeof data11.createdAt !== "string") {
                const err23 = { instancePath: instancePath + "/events/" + i4 + "/createdAt", schemaPath: "#/$defs/Event/properties/createdAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err23];
                } else {
                  vErrors.push(err23);
                }
                errors++;
              }
            }
            if (data11.data !== void 0) {
              let data16 = data11.data;
              if (data16 && typeof data16 == "object" && !Array.isArray(data16)) {
              } else {
                const err24 = { instancePath: instancePath + "/events/" + i4 + "/data", schemaPath: "#/$defs/Event/properties/data/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err24];
                } else {
                  vErrors.push(err24);
                }
                errors++;
              }
            }
          } else {
            const err25 = { instancePath: instancePath + "/events/" + i4, schemaPath: "#/$defs/Event/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err25];
            } else {
              vErrors.push(err25);
            }
            errors++;
          }
        }
      } else {
        const err26 = { instancePath: instancePath + "/events", schemaPath: "#/properties/events/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err26];
        } else {
          vErrors.push(err26);
        }
        errors++;
      }
    }
  } else {
    const err27 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err27];
    } else {
      vErrors.push(err27);
    }
    errors++;
  }
  validate10.errors = vErrors;
  return errors === 0;
}
var validatePlan = validate27;
function validate27(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.id === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.name === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.description === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "description" }, message: "must have required property 'description'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.deviceId === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "deviceId" }, message: "must have required property 'deviceId'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.group === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "group" }, message: "must have required property 'group'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.budgets === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "budgets" }, message: "must have required property 'budgets'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.tasks === void 0) {
      const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "tasks" }, message: "must have required property 'tasks'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.schedule === void 0) {
      const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "schedule" }, message: "must have required property 'schedule'" };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.enabled === void 0) {
      const err8 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "enabled" }, message: "must have required property 'enabled'" };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func2.call(schema14.properties, key0)) {
        const err9 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.id !== void 0) {
      if (typeof data.id !== "string") {
        const err10 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.name !== void 0) {
      let data1 = data.name;
      if (typeof data1 === "string") {
        if (func3(data1) > 80) {
          const err11 = { instancePath: instancePath + "/name", schemaPath: "#/properties/name/maxLength", keyword: "maxLength", params: { limit: 80 }, message: "must NOT have more than 80 characters" };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
        if (func3(data1) < 1) {
          const err12 = { instancePath: instancePath + "/name", schemaPath: "#/properties/name/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
      } else {
        const err13 = { instancePath: instancePath + "/name", schemaPath: "#/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
    if (data.description !== void 0) {
      let data2 = data.description;
      if (typeof data2 === "string") {
        if (func3(data2) > 500) {
          const err14 = { instancePath: instancePath + "/description", schemaPath: "#/properties/description/maxLength", keyword: "maxLength", params: { limit: 500 }, message: "must NOT have more than 500 characters" };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
      } else {
        const err15 = { instancePath: instancePath + "/description", schemaPath: "#/properties/description/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.deviceId !== void 0) {
      let data3 = data.deviceId;
      const _errs9 = errors;
      let valid1 = false;
      const _errs10 = errors;
      if (typeof data3 === "string") {
        if (func3(data3) > 200) {
          const err16 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/anyOf/0/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
        if (func3(data3) < 1) {
          const err17 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/anyOf/0/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
      } else {
        const err18 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/anyOf/0/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
      var _valid0 = _errs10 === errors;
      valid1 = valid1 || _valid0;
      if (!valid1) {
        const _errs12 = errors;
        if (data3 !== null) {
          const err19 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/anyOf/1/type", keyword: "type", params: { type: "null" }, message: "must be null" };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
        var _valid0 = _errs12 === errors;
        valid1 = valid1 || _valid0;
      }
      if (!valid1) {
        const err20 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      } else {
        errors = _errs9;
        if (vErrors !== null) {
          if (_errs9) {
            vErrors.length = _errs9;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.group !== void 0) {
      let data4 = data.group;
      if (typeof data4 !== "string") {
        const err21 = { instancePath: instancePath + "/group", schemaPath: "#/properties/group/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
        }
        errors++;
      }
      if (!(data4 === "daily" || data4 === "specialized")) {
        const err22 = { instancePath: instancePath + "/group", schemaPath: "#/properties/group/enum", keyword: "enum", params: { allowedValues: schema14.properties.group.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
    }
    if (data.budgets !== void 0) {
      let data5 = data.budgets;
      const _errs17 = errors;
      let valid2 = false;
      const _errs18 = errors;
      if (data5 && typeof data5 == "object" && !Array.isArray(data5)) {
        if (data5.originium === void 0) {
          const err23 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/required", keyword: "required", params: { missingProperty: "originium" }, message: "must have required property 'originium'" };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
        if (data5.medicine === void 0) {
          const err24 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/required", keyword: "required", params: { missingProperty: "medicine" }, message: "must have required property 'medicine'" };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
        if (data5.expedited === void 0) {
          const err25 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/required", keyword: "required", params: { missingProperty: "expedited" }, message: "must have required property 'expedited'" };
          if (vErrors === null) {
            vErrors = [err25];
          } else {
            vErrors.push(err25);
          }
          errors++;
        }
        for (const key1 in data5) {
          if (!(key1 === "originium" || key1 === "medicine" || key1 === "expedited")) {
            const err26 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err26];
            } else {
              vErrors.push(err26);
            }
            errors++;
          }
        }
        if (data5.originium !== void 0) {
          let data6 = data5.originium;
          if (!(typeof data6 == "number" && (!(data6 % 1) && !isNaN(data6)) && isFinite(data6))) {
            const err27 = { instancePath: instancePath + "/budgets/originium", schemaPath: "#/$defs/Budgets/properties/originium/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err27];
            } else {
              vErrors.push(err27);
            }
            errors++;
          }
          if (typeof data6 == "number" && isFinite(data6)) {
            if (data6 > 100 || isNaN(data6)) {
              const err28 = { instancePath: instancePath + "/budgets/originium", schemaPath: "#/$defs/Budgets/properties/originium/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
              if (vErrors === null) {
                vErrors = [err28];
              } else {
                vErrors.push(err28);
              }
              errors++;
            }
            if (data6 < 0 || isNaN(data6)) {
              const err29 = { instancePath: instancePath + "/budgets/originium", schemaPath: "#/$defs/Budgets/properties/originium/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err29];
              } else {
                vErrors.push(err29);
              }
              errors++;
            }
          }
        }
        if (data5.medicine !== void 0) {
          let data7 = data5.medicine;
          if (!(typeof data7 == "number" && (!(data7 % 1) && !isNaN(data7)) && isFinite(data7))) {
            const err30 = { instancePath: instancePath + "/budgets/medicine", schemaPath: "#/$defs/Budgets/properties/medicine/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err30];
            } else {
              vErrors.push(err30);
            }
            errors++;
          }
          if (typeof data7 == "number" && isFinite(data7)) {
            if (data7 > 100 || isNaN(data7)) {
              const err31 = { instancePath: instancePath + "/budgets/medicine", schemaPath: "#/$defs/Budgets/properties/medicine/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
              if (vErrors === null) {
                vErrors = [err31];
              } else {
                vErrors.push(err31);
              }
              errors++;
            }
            if (data7 < 0 || isNaN(data7)) {
              const err32 = { instancePath: instancePath + "/budgets/medicine", schemaPath: "#/$defs/Budgets/properties/medicine/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err32];
              } else {
                vErrors.push(err32);
              }
              errors++;
            }
          }
        }
        if (data5.expedited !== void 0) {
          let data8 = data5.expedited;
          if (!(typeof data8 == "number" && (!(data8 % 1) && !isNaN(data8)) && isFinite(data8))) {
            const err33 = { instancePath: instancePath + "/budgets/expedited", schemaPath: "#/$defs/Budgets/properties/expedited/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err33];
            } else {
              vErrors.push(err33);
            }
            errors++;
          }
          if (typeof data8 == "number" && isFinite(data8)) {
            if (data8 > 100 || isNaN(data8)) {
              const err34 = { instancePath: instancePath + "/budgets/expedited", schemaPath: "#/$defs/Budgets/properties/expedited/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
              if (vErrors === null) {
                vErrors = [err34];
              } else {
                vErrors.push(err34);
              }
              errors++;
            }
            if (data8 < 0 || isNaN(data8)) {
              const err35 = { instancePath: instancePath + "/budgets/expedited", schemaPath: "#/$defs/Budgets/properties/expedited/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err35];
              } else {
                vErrors.push(err35);
              }
              errors++;
            }
          }
        }
      } else {
        const err36 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err36];
        } else {
          vErrors.push(err36);
        }
        errors++;
      }
      var _valid1 = _errs18 === errors;
      valid2 = valid2 || _valid1;
      if (!valid2) {
        const _errs28 = errors;
        if (data5 !== null) {
          const err37 = { instancePath: instancePath + "/budgets", schemaPath: "#/properties/budgets/anyOf/1/type", keyword: "type", params: { type: "null" }, message: "must be null" };
          if (vErrors === null) {
            vErrors = [err37];
          } else {
            vErrors.push(err37);
          }
          errors++;
        }
        var _valid1 = _errs28 === errors;
        valid2 = valid2 || _valid1;
      }
      if (!valid2) {
        const err38 = { instancePath: instancePath + "/budgets", schemaPath: "#/properties/budgets/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err38];
        } else {
          vErrors.push(err38);
        }
        errors++;
      } else {
        errors = _errs17;
        if (vErrors !== null) {
          if (_errs17) {
            vErrors.length = _errs17;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.tasks !== void 0) {
      let data9 = data.tasks;
      if (Array.isArray(data9)) {
        if (data9.length > 30) {
          const err39 = { instancePath: instancePath + "/tasks", schemaPath: "#/properties/tasks/maxItems", keyword: "maxItems", params: { limit: 30 }, message: "must NOT have more than 30 items" };
          if (vErrors === null) {
            vErrors = [err39];
          } else {
            vErrors.push(err39);
          }
          errors++;
        }
        if (data9.length < 1) {
          const err40 = { instancePath: instancePath + "/tasks", schemaPath: "#/properties/tasks/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
          if (vErrors === null) {
            vErrors = [err40];
          } else {
            vErrors.push(err40);
          }
          errors++;
        }
        const len0 = data9.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data10 = data9[i0];
          if (data10 && typeof data10 == "object" && !Array.isArray(data10)) {
            if (data10.type === void 0) {
              const err41 = { instancePath: instancePath + "/tasks/" + i0, schemaPath: "#/$defs/Task/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
              if (vErrors === null) {
                vErrors = [err41];
              } else {
                vErrors.push(err41);
              }
              errors++;
            }
            if (data10.params === void 0) {
              const err42 = { instancePath: instancePath + "/tasks/" + i0, schemaPath: "#/$defs/Task/required", keyword: "required", params: { missingProperty: "params" }, message: "must have required property 'params'" };
              if (vErrors === null) {
                vErrors = [err42];
              } else {
                vErrors.push(err42);
              }
              errors++;
            }
            if (data10.enabled === void 0) {
              const err43 = { instancePath: instancePath + "/tasks/" + i0, schemaPath: "#/$defs/Task/required", keyword: "required", params: { missingProperty: "enabled" }, message: "must have required property 'enabled'" };
              if (vErrors === null) {
                vErrors = [err43];
              } else {
                vErrors.push(err43);
              }
              errors++;
            }
            for (const key2 in data10) {
              if (!(key2 === "type" || key2 === "params" || key2 === "enabled")) {
                const err44 = { instancePath: instancePath + "/tasks/" + i0, schemaPath: "#/$defs/Task/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err44];
                } else {
                  vErrors.push(err44);
                }
                errors++;
              }
            }
            if (data10.type !== void 0) {
              let data11 = data10.type;
              if (typeof data11 !== "string") {
                const err45 = { instancePath: instancePath + "/tasks/" + i0 + "/type", schemaPath: "#/$defs/Task/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err45];
                } else {
                  vErrors.push(err45);
                }
                errors++;
              }
              if (!(data11 === "StartUp" || data11 === "CloseDown" || data11 === "Fight" || data11 === "Recruit" || data11 === "Infrast" || data11 === "Mall" || data11 === "Award" || data11 === "SwitchTheme" || data11 === "Roguelike" || data11 === "Copilot" || data11 === "SSSCopilot" || data11 === "ParadoxCopilot" || data11 === "Depot" || data11 === "OperBox" || data11 === "Reclamation" || data11 === "Custom" || data11 === "SingleStep" || data11 === "VideoRecognition" || data11 === "OperProgress" || data11 === "UserDataUpdate")) {
                const err46 = { instancePath: instancePath + "/tasks/" + i0 + "/type", schemaPath: "#/$defs/Task/properties/type/enum", keyword: "enum", params: { allowedValues: schema16.properties.type.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err46];
                } else {
                  vErrors.push(err46);
                }
                errors++;
              }
            }
            if (data10.params !== void 0) {
              let data12 = data10.params;
              if (data12 && typeof data12 == "object" && !Array.isArray(data12)) {
              } else {
                const err47 = { instancePath: instancePath + "/tasks/" + i0 + "/params", schemaPath: "#/$defs/Task/properties/params/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err47];
                } else {
                  vErrors.push(err47);
                }
                errors++;
              }
            }
            if (data10.enabled !== void 0) {
              if (typeof data10.enabled !== "boolean") {
                const err48 = { instancePath: instancePath + "/tasks/" + i0 + "/enabled", schemaPath: "#/$defs/Task/properties/enabled/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                if (vErrors === null) {
                  vErrors = [err48];
                } else {
                  vErrors.push(err48);
                }
                errors++;
              }
            }
          } else {
            const err49 = { instancePath: instancePath + "/tasks/" + i0, schemaPath: "#/$defs/Task/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err49];
            } else {
              vErrors.push(err49);
            }
            errors++;
          }
        }
      } else {
        const err50 = { instancePath: instancePath + "/tasks", schemaPath: "#/properties/tasks/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err50];
        } else {
          vErrors.push(err50);
        }
        errors++;
      }
    }
    if (data.schedule !== void 0) {
      let data14 = data.schedule;
      const _errs44 = errors;
      let valid9 = false;
      const _errs45 = errors;
      if (typeof data14 !== "string") {
        const err51 = { instancePath: instancePath + "/schedule", schemaPath: "#/properties/schedule/anyOf/0/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err51];
        } else {
          vErrors.push(err51);
        }
        errors++;
      }
      var _valid2 = _errs45 === errors;
      valid9 = valid9 || _valid2;
      if (!valid9) {
        const _errs47 = errors;
        if (data14 !== null) {
          const err52 = { instancePath: instancePath + "/schedule", schemaPath: "#/properties/schedule/anyOf/1/type", keyword: "type", params: { type: "null" }, message: "must be null" };
          if (vErrors === null) {
            vErrors = [err52];
          } else {
            vErrors.push(err52);
          }
          errors++;
        }
        var _valid2 = _errs47 === errors;
        valid9 = valid9 || _valid2;
      }
      if (!valid9) {
        const err53 = { instancePath: instancePath + "/schedule", schemaPath: "#/properties/schedule/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err53];
        } else {
          vErrors.push(err53);
        }
        errors++;
      } else {
        errors = _errs44;
        if (vErrors !== null) {
          if (_errs44) {
            vErrors.length = _errs44;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.enabled !== void 0) {
      if (typeof data.enabled !== "boolean") {
        const err54 = { instancePath: instancePath + "/enabled", schemaPath: "#/properties/enabled/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err54];
        } else {
          vErrors.push(err54);
        }
        errors++;
      }
    }
  } else {
    const err55 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err55];
    } else {
      vErrors.push(err55);
    }
    errors++;
  }
  validate27.errors = vErrors;
  return errors === 0;
}
var validateSettings = validate28;
function validate28(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.autoConnect === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "autoConnect" }, message: "must have required property 'autoConnect'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.autoUpdateCore === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "autoUpdateCore" }, message: "must have required property 'autoUpdateCore'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.autoUpdateResource === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "autoUpdateResource" }, message: "must have required property 'autoUpdateResource'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.minimizeToTray === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "minimizeToTray" }, message: "must have required property 'minimizeToTray'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.theme === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "theme" }, message: "must have required property 'theme'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.budgets === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "budgets" }, message: "must have required property 'budgets'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.model === void 0) {
      const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "model" }, message: "must have required property 'model'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func2.call(schema24.properties, key0)) {
        const err7 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.componentPaths !== void 0) {
      let data0 = data.componentPaths;
      if (data0 && typeof data0 == "object" && !Array.isArray(data0)) {
        if (data0.core === void 0) {
          const err8 = { instancePath: instancePath + "/componentPaths", schemaPath: "#/$defs/ComponentPaths/required", keyword: "required", params: { missingProperty: "core" }, message: "must have required property 'core'" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        if (data0.resource === void 0) {
          const err9 = { instancePath: instancePath + "/componentPaths", schemaPath: "#/$defs/ComponentPaths/required", keyword: "required", params: { missingProperty: "resource" }, message: "must have required property 'resource'" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
        for (const key1 in data0) {
          if (!(key1 === "core" || key1 === "resource")) {
            const err10 = { instancePath: instancePath + "/componentPaths", schemaPath: "#/$defs/ComponentPaths/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data0.core !== void 0) {
          let data1 = data0.core;
          if (typeof data1 === "string") {
            if (func3(data1) > 4096) {
              const err11 = { instancePath: instancePath + "/componentPaths/core", schemaPath: "#/$defs/ComponentPaths/properties/core/maxLength", keyword: "maxLength", params: { limit: 4096 }, message: "must NOT have more than 4096 characters" };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
          } else {
            const err12 = { instancePath: instancePath + "/componentPaths/core", schemaPath: "#/$defs/ComponentPaths/properties/core/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data0.resource !== void 0) {
          let data2 = data0.resource;
          if (typeof data2 === "string") {
            if (func3(data2) > 4096) {
              const err13 = { instancePath: instancePath + "/componentPaths/resource", schemaPath: "#/$defs/ComponentPaths/properties/resource/maxLength", keyword: "maxLength", params: { limit: 4096 }, message: "must NOT have more than 4096 characters" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          } else {
            const err14 = { instancePath: instancePath + "/componentPaths/resource", schemaPath: "#/$defs/ComponentPaths/properties/resource/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
      } else {
        const err15 = { instancePath: instancePath + "/componentPaths", schemaPath: "#/$defs/ComponentPaths/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.componentDownload !== void 0) {
      let data3 = data.componentDownload;
      if (data3 && typeof data3 == "object" && !Array.isArray(data3)) {
        if (data3.engine === void 0) {
          const err16 = { instancePath: instancePath + "/componentDownload", schemaPath: "#/$defs/ComponentDownload/required", keyword: "required", params: { missingProperty: "engine" }, message: "must have required property 'engine'" };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
        if (data3.aria2Path === void 0) {
          const err17 = { instancePath: instancePath + "/componentDownload", schemaPath: "#/$defs/ComponentDownload/required", keyword: "required", params: { missingProperty: "aria2Path" }, message: "must have required property 'aria2Path'" };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
        for (const key2 in data3) {
          if (!(key2 === "engine" || key2 === "aria2Path")) {
            const err18 = { instancePath: instancePath + "/componentDownload", schemaPath: "#/$defs/ComponentDownload/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
        }
        if (data3.engine !== void 0) {
          let data4 = data3.engine;
          if (typeof data4 !== "string") {
            const err19 = { instancePath: instancePath + "/componentDownload/engine", schemaPath: "#/$defs/ComponentDownload/properties/engine/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
          if (!(data4 === "builtin" || data4 === "aria2")) {
            const err20 = { instancePath: instancePath + "/componentDownload/engine", schemaPath: "#/$defs/ComponentDownload/properties/engine/enum", keyword: "enum", params: { allowedValues: schema26.properties.engine.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          }
        }
        if (data3.aria2Path !== void 0) {
          let data5 = data3.aria2Path;
          if (typeof data5 === "string") {
            if (func3(data5) > 4096) {
              const err21 = { instancePath: instancePath + "/componentDownload/aria2Path", schemaPath: "#/$defs/ComponentDownload/properties/aria2Path/maxLength", keyword: "maxLength", params: { limit: 4096 }, message: "must NOT have more than 4096 characters" };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
          } else {
            const err22 = { instancePath: instancePath + "/componentDownload/aria2Path", schemaPath: "#/$defs/ComponentDownload/properties/aria2Path/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
        }
      } else {
        const err23 = { instancePath: instancePath + "/componentDownload", schemaPath: "#/$defs/ComponentDownload/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
        }
        errors++;
      }
    }
    if (data.infrastructureEstimates !== void 0) {
      let data6 = data.infrastructureEstimates;
      if (Array.isArray(data6)) {
        if (data6.length > 100) {
          const err24 = { instancePath: instancePath + "/infrastructureEstimates", schemaPath: "#/properties/infrastructureEstimates/maxItems", keyword: "maxItems", params: { limit: 100 }, message: "must NOT have more than 100 items" };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
        const len0 = data6.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (!validate22(data6[i0], { instancePath: instancePath + "/infrastructureEstimates/" + i0, parentData: data6, parentDataProperty: i0, rootData })) {
            vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err25 = { instancePath: instancePath + "/infrastructureEstimates", schemaPath: "#/properties/infrastructureEstimates/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
    }
    if (data.capture !== void 0) {
      let data8 = data.capture;
      if (data8 && typeof data8 == "object" && !Array.isArray(data8)) {
        if (data8.method === void 0) {
          const err26 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/CaptureSettings/required", keyword: "required", params: { missingProperty: "method" }, message: "must have required property 'method'" };
          if (vErrors === null) {
            vErrors = [err26];
          } else {
            vErrors.push(err26);
          }
          errors++;
        }
        if (data8.emulatorPath === void 0) {
          const err27 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/CaptureSettings/required", keyword: "required", params: { missingProperty: "emulatorPath" }, message: "must have required property 'emulatorPath'" };
          if (vErrors === null) {
            vErrors = [err27];
          } else {
            vErrors.push(err27);
          }
          errors++;
        }
        if (data8.instanceIndex === void 0) {
          const err28 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/CaptureSettings/required", keyword: "required", params: { missingProperty: "instanceIndex" }, message: "must have required property 'instanceIndex'" };
          if (vErrors === null) {
            vErrors = [err28];
          } else {
            vErrors.push(err28);
          }
          errors++;
        }
        for (const key3 in data8) {
          if (!(key3 === "method" || key3 === "autoDetect" || key3 === "emulatorPath" || key3 === "instanceIndex" || key3 === "mumuTouch" || key3 === "mumuBridge")) {
            const err29 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/CaptureSettings/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err29];
            } else {
              vErrors.push(err29);
            }
            errors++;
          }
        }
        if (data8.method !== void 0) {
          let data9 = data8.method;
          if (typeof data9 !== "string") {
            const err30 = { instancePath: instancePath + "/capture/method", schemaPath: "#/$defs/CaptureSettings/properties/method/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err30];
            } else {
              vErrors.push(err30);
            }
            errors++;
          }
          if (!(data9 === "adb" || data9 === "mumu" || data9 === "ldplayer")) {
            const err31 = { instancePath: instancePath + "/capture/method", schemaPath: "#/$defs/CaptureSettings/properties/method/enum", keyword: "enum", params: { allowedValues: schema29.properties.method.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err31];
            } else {
              vErrors.push(err31);
            }
            errors++;
          }
        }
        if (data8.autoDetect !== void 0) {
          if (typeof data8.autoDetect !== "boolean") {
            const err32 = { instancePath: instancePath + "/capture/autoDetect", schemaPath: "#/$defs/CaptureSettings/properties/autoDetect/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err32];
            } else {
              vErrors.push(err32);
            }
            errors++;
          }
        }
        if (data8.emulatorPath !== void 0) {
          let data11 = data8.emulatorPath;
          if (typeof data11 === "string") {
            if (func3(data11) > 4096) {
              const err33 = { instancePath: instancePath + "/capture/emulatorPath", schemaPath: "#/$defs/CaptureSettings/properties/emulatorPath/maxLength", keyword: "maxLength", params: { limit: 4096 }, message: "must NOT have more than 4096 characters" };
              if (vErrors === null) {
                vErrors = [err33];
              } else {
                vErrors.push(err33);
              }
              errors++;
            }
          } else {
            const err34 = { instancePath: instancePath + "/capture/emulatorPath", schemaPath: "#/$defs/CaptureSettings/properties/emulatorPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err34];
            } else {
              vErrors.push(err34);
            }
            errors++;
          }
        }
        if (data8.instanceIndex !== void 0) {
          let data12 = data8.instanceIndex;
          if (!(typeof data12 == "number" && (!(data12 % 1) && !isNaN(data12)) && isFinite(data12))) {
            const err35 = { instancePath: instancePath + "/capture/instanceIndex", schemaPath: "#/$defs/CaptureSettings/properties/instanceIndex/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err35];
            } else {
              vErrors.push(err35);
            }
            errors++;
          }
          if (typeof data12 == "number" && isFinite(data12)) {
            if (data12 > 65535 || isNaN(data12)) {
              const err36 = { instancePath: instancePath + "/capture/instanceIndex", schemaPath: "#/$defs/CaptureSettings/properties/instanceIndex/maximum", keyword: "maximum", params: { comparison: "<=", limit: 65535 }, message: "must be <= 65535" };
              if (vErrors === null) {
                vErrors = [err36];
              } else {
                vErrors.push(err36);
              }
              errors++;
            }
            if (data12 < 0 || isNaN(data12)) {
              const err37 = { instancePath: instancePath + "/capture/instanceIndex", schemaPath: "#/$defs/CaptureSettings/properties/instanceIndex/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err37];
              } else {
                vErrors.push(err37);
              }
              errors++;
            }
          }
        }
        if (data8.mumuTouch !== void 0) {
          if (typeof data8.mumuTouch !== "boolean") {
            const err38 = { instancePath: instancePath + "/capture/mumuTouch", schemaPath: "#/$defs/CaptureSettings/properties/mumuTouch/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err38];
            } else {
              vErrors.push(err38);
            }
            errors++;
          }
        }
        if (data8.mumuBridge !== void 0) {
          if (typeof data8.mumuBridge !== "boolean") {
            const err39 = { instancePath: instancePath + "/capture/mumuBridge", schemaPath: "#/$defs/CaptureSettings/properties/mumuBridge/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err39];
            } else {
              vErrors.push(err39);
            }
            errors++;
          }
        }
      } else {
        const err40 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/CaptureSettings/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err40];
        } else {
          vErrors.push(err40);
        }
        errors++;
      }
    }
    if (data.connection !== void 0) {
      let data15 = data.connection;
      if (data15 && typeof data15 == "object" && !Array.isArray(data15)) {
        if (data15.adbPath === void 0) {
          const err41 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/ConnectionSettings/required", keyword: "required", params: { missingProperty: "adbPath" }, message: "must have required property 'adbPath'" };
          if (vErrors === null) {
            vErrors = [err41];
          } else {
            vErrors.push(err41);
          }
          errors++;
        }
        if (data15.address === void 0) {
          const err42 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/ConnectionSettings/required", keyword: "required", params: { missingProperty: "address" }, message: "must have required property 'address'" };
          if (vErrors === null) {
            vErrors = [err42];
          } else {
            vErrors.push(err42);
          }
          errors++;
        }
        if (data15.config === void 0) {
          const err43 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/ConnectionSettings/required", keyword: "required", params: { missingProperty: "config" }, message: "must have required property 'config'" };
          if (vErrors === null) {
            vErrors = [err43];
          } else {
            vErrors.push(err43);
          }
          errors++;
        }
        if (data15.touchMode === void 0) {
          const err44 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/ConnectionSettings/required", keyword: "required", params: { missingProperty: "touchMode" }, message: "must have required property 'touchMode'" };
          if (vErrors === null) {
            vErrors = [err44];
          } else {
            vErrors.push(err44);
          }
          errors++;
        }
        if (data15.adbLite === void 0) {
          const err45 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/ConnectionSettings/required", keyword: "required", params: { missingProperty: "adbLite" }, message: "must have required property 'adbLite'" };
          if (vErrors === null) {
            vErrors = [err45];
          } else {
            vErrors.push(err45);
          }
          errors++;
        }
        if (data15.clientType === void 0) {
          const err46 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/ConnectionSettings/required", keyword: "required", params: { missingProperty: "clientType" }, message: "must have required property 'clientType'" };
          if (vErrors === null) {
            vErrors = [err46];
          } else {
            vErrors.push(err46);
          }
          errors++;
        }
        for (const key4 in data15) {
          if (!(key4 === "adbPath" || key4 === "address" || key4 === "config" || key4 === "touchMode" || key4 === "adbLite" || key4 === "clientType")) {
            const err47 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/ConnectionSettings/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err47];
            } else {
              vErrors.push(err47);
            }
            errors++;
          }
        }
        if (data15.adbPath !== void 0) {
          let data16 = data15.adbPath;
          if (typeof data16 === "string") {
            if (func3(data16) > 4096) {
              const err48 = { instancePath: instancePath + "/connection/adbPath", schemaPath: "#/$defs/ConnectionSettings/properties/adbPath/maxLength", keyword: "maxLength", params: { limit: 4096 }, message: "must NOT have more than 4096 characters" };
              if (vErrors === null) {
                vErrors = [err48];
              } else {
                vErrors.push(err48);
              }
              errors++;
            }
          } else {
            const err49 = { instancePath: instancePath + "/connection/adbPath", schemaPath: "#/$defs/ConnectionSettings/properties/adbPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err49];
            } else {
              vErrors.push(err49);
            }
            errors++;
          }
        }
        if (data15.address !== void 0) {
          let data17 = data15.address;
          if (typeof data17 === "string") {
            if (func3(data17) > 128) {
              const err50 = { instancePath: instancePath + "/connection/address", schemaPath: "#/$defs/ConnectionSettings/properties/address/maxLength", keyword: "maxLength", params: { limit: 128 }, message: "must NOT have more than 128 characters" };
              if (vErrors === null) {
                vErrors = [err50];
              } else {
                vErrors.push(err50);
              }
              errors++;
            }
          } else {
            const err51 = { instancePath: instancePath + "/connection/address", schemaPath: "#/$defs/ConnectionSettings/properties/address/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err51];
            } else {
              vErrors.push(err51);
            }
            errors++;
          }
        }
        if (data15.config !== void 0) {
          let data18 = data15.config;
          if (typeof data18 !== "string") {
            const err52 = { instancePath: instancePath + "/connection/config", schemaPath: "#/$defs/ConnectionSettings/properties/config/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err52];
            } else {
              vErrors.push(err52);
            }
            errors++;
          }
          if (!(data18 === "General" || data18 === "BlueStacks" || data18 === "MuMuEmulator12" || data18 === "MuMuArm" || data18 === "LDPlayer" || data18 === "Nox" || data18 === "XYAZ" || data18 === "Compatible" || data18 === "SecondResolution" || data18 === "CompatMac" || data18 === "CompatPOSIXShell" || data18 === "Waydroid" || data18 === "AVD" || data18 === "Androws" || data18 === "WSA")) {
            const err53 = { instancePath: instancePath + "/connection/config", schemaPath: "#/$defs/ConnectionSettings/properties/config/enum", keyword: "enum", params: { allowedValues: schema30.properties.config.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err53];
            } else {
              vErrors.push(err53);
            }
            errors++;
          }
        }
        if (data15.touchMode !== void 0) {
          let data19 = data15.touchMode;
          if (typeof data19 !== "string") {
            const err54 = { instancePath: instancePath + "/connection/touchMode", schemaPath: "#/$defs/ConnectionSettings/properties/touchMode/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err54];
            } else {
              vErrors.push(err54);
            }
            errors++;
          }
          if (!(data19 === "minitouch" || data19 === "maatouch" || data19 === "adb" || data19 === "MaaFwAdb")) {
            const err55 = { instancePath: instancePath + "/connection/touchMode", schemaPath: "#/$defs/ConnectionSettings/properties/touchMode/enum", keyword: "enum", params: { allowedValues: schema30.properties.touchMode.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err55];
            } else {
              vErrors.push(err55);
            }
            errors++;
          }
        }
        if (data15.adbLite !== void 0) {
          if (typeof data15.adbLite !== "boolean") {
            const err56 = { instancePath: instancePath + "/connection/adbLite", schemaPath: "#/$defs/ConnectionSettings/properties/adbLite/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err56];
            } else {
              vErrors.push(err56);
            }
            errors++;
          }
        }
        if (data15.clientType !== void 0) {
          let data21 = data15.clientType;
          if (typeof data21 !== "string") {
            const err57 = { instancePath: instancePath + "/connection/clientType", schemaPath: "#/$defs/ConnectionSettings/properties/clientType/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err57];
            } else {
              vErrors.push(err57);
            }
            errors++;
          }
          if (!(data21 === "Official" || data21 === "Bilibili" || data21 === "YoStarEN" || data21 === "YoStarJP" || data21 === "YoStarKR" || data21 === "txwy")) {
            const err58 = { instancePath: instancePath + "/connection/clientType", schemaPath: "#/$defs/ConnectionSettings/properties/clientType/enum", keyword: "enum", params: { allowedValues: schema30.properties.clientType.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err58];
            } else {
              vErrors.push(err58);
            }
            errors++;
          }
        }
      } else {
        const err59 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/ConnectionSettings/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err59];
        } else {
          vErrors.push(err59);
        }
        errors++;
      }
    }
    if (data.deviceProfiles !== void 0) {
      let data22 = data.deviceProfiles;
      if (Array.isArray(data22)) {
        if (data22.length > 32) {
          const err60 = { instancePath: instancePath + "/deviceProfiles", schemaPath: "#/properties/deviceProfiles/maxItems", keyword: "maxItems", params: { limit: 32 }, message: "must NOT have more than 32 items" };
          if (vErrors === null) {
            vErrors = [err60];
          } else {
            vErrors.push(err60);
          }
          errors++;
        }
        const len1 = data22.length;
        for (let i1 = 0; i1 < len1; i1++) {
          if (!validate24(data22[i1], { instancePath: instancePath + "/deviceProfiles/" + i1, parentData: data22, parentDataProperty: i1, rootData })) {
            vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err61 = { instancePath: instancePath + "/deviceProfiles", schemaPath: "#/properties/deviceProfiles/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err61];
        } else {
          vErrors.push(err61);
        }
        errors++;
      }
    }
    if (data.logRetentionDays !== void 0) {
      let data24 = data.logRetentionDays;
      if (!(typeof data24 == "number" && (!(data24 % 1) && !isNaN(data24)) && isFinite(data24))) {
        const err62 = { instancePath: instancePath + "/logRetentionDays", schemaPath: "#/properties/logRetentionDays/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err62];
        } else {
          vErrors.push(err62);
        }
        errors++;
      }
      if (!(data24 === 0 || data24 === 7 || data24 === 14 || data24 === 30)) {
        const err63 = { instancePath: instancePath + "/logRetentionDays", schemaPath: "#/properties/logRetentionDays/enum", keyword: "enum", params: { allowedValues: schema24.properties.logRetentionDays.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err63];
        } else {
          vErrors.push(err63);
        }
        errors++;
      }
    }
    if (data.autoConnect !== void 0) {
      if (typeof data.autoConnect !== "boolean") {
        const err64 = { instancePath: instancePath + "/autoConnect", schemaPath: "#/properties/autoConnect/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err64];
        } else {
          vErrors.push(err64);
        }
        errors++;
      }
    }
    if (data.autoUpdateCore !== void 0) {
      if (typeof data.autoUpdateCore !== "boolean") {
        const err65 = { instancePath: instancePath + "/autoUpdateCore", schemaPath: "#/properties/autoUpdateCore/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err65];
        } else {
          vErrors.push(err65);
        }
        errors++;
      }
    }
    if (data.autoUpdateResource !== void 0) {
      if (typeof data.autoUpdateResource !== "boolean") {
        const err66 = { instancePath: instancePath + "/autoUpdateResource", schemaPath: "#/properties/autoUpdateResource/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err66];
        } else {
          vErrors.push(err66);
        }
        errors++;
      }
    }
    if (data.minimizeToTray !== void 0) {
      if (typeof data.minimizeToTray !== "boolean") {
        const err67 = { instancePath: instancePath + "/minimizeToTray", schemaPath: "#/properties/minimizeToTray/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err67];
        } else {
          vErrors.push(err67);
        }
        errors++;
      }
    }
    if (data.theme !== void 0) {
      let data29 = data.theme;
      if (typeof data29 !== "string") {
        const err68 = { instancePath: instancePath + "/theme", schemaPath: "#/properties/theme/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err68];
        } else {
          vErrors.push(err68);
        }
        errors++;
      }
      if (!(data29 === "dark" || data29 === "light" || data29 === "system")) {
        const err69 = { instancePath: instancePath + "/theme", schemaPath: "#/properties/theme/enum", keyword: "enum", params: { allowedValues: schema24.properties.theme.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err69];
        } else {
          vErrors.push(err69);
        }
        errors++;
      }
    }
    if (data.budgets !== void 0) {
      let data30 = data.budgets;
      if (data30 && typeof data30 == "object" && !Array.isArray(data30)) {
        if (data30.originium === void 0) {
          const err70 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/required", keyword: "required", params: { missingProperty: "originium" }, message: "must have required property 'originium'" };
          if (vErrors === null) {
            vErrors = [err70];
          } else {
            vErrors.push(err70);
          }
          errors++;
        }
        if (data30.medicine === void 0) {
          const err71 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/required", keyword: "required", params: { missingProperty: "medicine" }, message: "must have required property 'medicine'" };
          if (vErrors === null) {
            vErrors = [err71];
          } else {
            vErrors.push(err71);
          }
          errors++;
        }
        if (data30.expedited === void 0) {
          const err72 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/required", keyword: "required", params: { missingProperty: "expedited" }, message: "must have required property 'expedited'" };
          if (vErrors === null) {
            vErrors = [err72];
          } else {
            vErrors.push(err72);
          }
          errors++;
        }
        for (const key5 in data30) {
          if (!(key5 === "originium" || key5 === "medicine" || key5 === "expedited")) {
            const err73 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key5 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err73];
            } else {
              vErrors.push(err73);
            }
            errors++;
          }
        }
        if (data30.originium !== void 0) {
          let data31 = data30.originium;
          if (!(typeof data31 == "number" && (!(data31 % 1) && !isNaN(data31)) && isFinite(data31))) {
            const err74 = { instancePath: instancePath + "/budgets/originium", schemaPath: "#/$defs/Budgets/properties/originium/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err74];
            } else {
              vErrors.push(err74);
            }
            errors++;
          }
          if (typeof data31 == "number" && isFinite(data31)) {
            if (data31 > 100 || isNaN(data31)) {
              const err75 = { instancePath: instancePath + "/budgets/originium", schemaPath: "#/$defs/Budgets/properties/originium/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
              if (vErrors === null) {
                vErrors = [err75];
              } else {
                vErrors.push(err75);
              }
              errors++;
            }
            if (data31 < 0 || isNaN(data31)) {
              const err76 = { instancePath: instancePath + "/budgets/originium", schemaPath: "#/$defs/Budgets/properties/originium/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err76];
              } else {
                vErrors.push(err76);
              }
              errors++;
            }
          }
        }
        if (data30.medicine !== void 0) {
          let data32 = data30.medicine;
          if (!(typeof data32 == "number" && (!(data32 % 1) && !isNaN(data32)) && isFinite(data32))) {
            const err77 = { instancePath: instancePath + "/budgets/medicine", schemaPath: "#/$defs/Budgets/properties/medicine/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err77];
            } else {
              vErrors.push(err77);
            }
            errors++;
          }
          if (typeof data32 == "number" && isFinite(data32)) {
            if (data32 > 100 || isNaN(data32)) {
              const err78 = { instancePath: instancePath + "/budgets/medicine", schemaPath: "#/$defs/Budgets/properties/medicine/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
              if (vErrors === null) {
                vErrors = [err78];
              } else {
                vErrors.push(err78);
              }
              errors++;
            }
            if (data32 < 0 || isNaN(data32)) {
              const err79 = { instancePath: instancePath + "/budgets/medicine", schemaPath: "#/$defs/Budgets/properties/medicine/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err79];
              } else {
                vErrors.push(err79);
              }
              errors++;
            }
          }
        }
        if (data30.expedited !== void 0) {
          let data33 = data30.expedited;
          if (!(typeof data33 == "number" && (!(data33 % 1) && !isNaN(data33)) && isFinite(data33))) {
            const err80 = { instancePath: instancePath + "/budgets/expedited", schemaPath: "#/$defs/Budgets/properties/expedited/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err80];
            } else {
              vErrors.push(err80);
            }
            errors++;
          }
          if (typeof data33 == "number" && isFinite(data33)) {
            if (data33 > 100 || isNaN(data33)) {
              const err81 = { instancePath: instancePath + "/budgets/expedited", schemaPath: "#/$defs/Budgets/properties/expedited/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
              if (vErrors === null) {
                vErrors = [err81];
              } else {
                vErrors.push(err81);
              }
              errors++;
            }
            if (data33 < 0 || isNaN(data33)) {
              const err82 = { instancePath: instancePath + "/budgets/expedited", schemaPath: "#/$defs/Budgets/properties/expedited/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err82];
              } else {
                vErrors.push(err82);
              }
              errors++;
            }
          }
        }
      } else {
        const err83 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err83];
        } else {
          vErrors.push(err83);
        }
        errors++;
      }
    }
    if (data.model !== void 0) {
      let data34 = data.model;
      if (data34 && typeof data34 == "object" && !Array.isArray(data34)) {
        if (data34.provider === void 0) {
          const err84 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/required", keyword: "required", params: { missingProperty: "provider" }, message: "must have required property 'provider'" };
          if (vErrors === null) {
            vErrors = [err84];
          } else {
            vErrors.push(err84);
          }
          errors++;
        }
        if (data34.baseUrl === void 0) {
          const err85 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/required", keyword: "required", params: { missingProperty: "baseUrl" }, message: "must have required property 'baseUrl'" };
          if (vErrors === null) {
            vErrors = [err85];
          } else {
            vErrors.push(err85);
          }
          errors++;
        }
        if (data34.model === void 0) {
          const err86 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/required", keyword: "required", params: { missingProperty: "model" }, message: "must have required property 'model'" };
          if (vErrors === null) {
            vErrors = [err86];
          } else {
            vErrors.push(err86);
          }
          errors++;
        }
        for (const key6 in data34) {
          if (!(key6 === "provider" || key6 === "baseUrl" || key6 === "model")) {
            const err87 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key6 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err87];
            } else {
              vErrors.push(err87);
            }
            errors++;
          }
        }
        if (data34.provider !== void 0) {
          if (typeof data34.provider !== "string") {
            const err88 = { instancePath: instancePath + "/model/provider", schemaPath: "#/$defs/ModelSettings/properties/provider/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err88];
            } else {
              vErrors.push(err88);
            }
            errors++;
          }
        }
        if (data34.baseUrl !== void 0) {
          if (typeof data34.baseUrl !== "string") {
            const err89 = { instancePath: instancePath + "/model/baseUrl", schemaPath: "#/$defs/ModelSettings/properties/baseUrl/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err89];
            } else {
              vErrors.push(err89);
            }
            errors++;
          }
        }
        if (data34.model !== void 0) {
          if (typeof data34.model !== "string") {
            const err90 = { instancePath: instancePath + "/model/model", schemaPath: "#/$defs/ModelSettings/properties/model/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err90];
            } else {
              vErrors.push(err90);
            }
            errors++;
          }
        }
      } else {
        const err91 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err91];
        } else {
          vErrors.push(err91);
        }
        errors++;
      }
    }
  } else {
    const err92 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err92];
    } else {
      vErrors.push(err92);
    }
    errors++;
  }
  validate28.errors = vErrors;
  return errors === 0;
}
var validateRpcRequest = validate68;
var schema96 = { "type": "object", "additionalProperties": false, "required": ["jsonrpc", "method"], "properties": { "jsonrpc": { "const": "2.0" }, "method": { "type": "string" }, "id": { "type": ["string", "integer", "null"] }, "params": { "type": "object", "additionalProperties": true } } };
function validate68(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.jsonrpc === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "jsonrpc" }, message: "must have required property 'jsonrpc'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.method === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "method" }, message: "must have required property 'method'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "jsonrpc" || key0 === "method" || key0 === "id" || key0 === "params")) {
        const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.jsonrpc !== void 0) {
      if ("2.0" !== data.jsonrpc) {
        const err3 = { instancePath: instancePath + "/jsonrpc", schemaPath: "#/properties/jsonrpc/const", keyword: "const", params: { allowedValue: "2.0" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.method !== void 0) {
      if (typeof data.method !== "string") {
        const err4 = { instancePath: instancePath + "/method", schemaPath: "#/properties/method/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    if (data.id !== void 0) {
      let data2 = data.id;
      if (typeof data2 !== "string" && !(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2)) && data2 !== null) {
        const err5 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/type", keyword: "type", params: { type: schema96.properties.id.type }, message: "must be string,integer,null" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.params !== void 0) {
      let data3 = data.params;
      if (data3 && typeof data3 == "object" && !Array.isArray(data3)) {
      } else {
        const err6 = { instancePath: instancePath + "/params", schemaPath: "#/properties/params/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
  } else {
    const err7 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err7];
    } else {
      vErrors.push(err7);
    }
    errors++;
  }
  validate68.errors = vErrors;
  return errors === 0;
}
var validateRpcEvent = validate69;
function validate69(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.jsonrpc === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "jsonrpc" }, message: "must have required property 'jsonrpc'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.method === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "method" }, message: "must have required property 'method'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.params === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "params" }, message: "must have required property 'params'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "jsonrpc" || key0 === "method" || key0 === "params")) {
        const err3 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.jsonrpc !== void 0) {
      if ("2.0" !== data.jsonrpc) {
        const err4 = { instancePath: instancePath + "/jsonrpc", schemaPath: "#/properties/jsonrpc/const", keyword: "const", params: { allowedValue: "2.0" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    if (data.method !== void 0) {
      if ("runtime.event" !== data.method) {
        const err5 = { instancePath: instancePath + "/method", schemaPath: "#/properties/method/const", keyword: "const", params: { allowedValue: "runtime.event" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.params !== void 0) {
      let data2 = data.params;
      if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
        if (data2.id === void 0) {
          const err6 = { instancePath: instancePath + "/params", schemaPath: "./runtime.schema.json#/$defs/Event/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (data2.type === void 0) {
          const err7 = { instancePath: instancePath + "/params", schemaPath: "./runtime.schema.json#/$defs/Event/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (data2.message === void 0) {
          const err8 = { instancePath: instancePath + "/params", schemaPath: "./runtime.schema.json#/$defs/Event/required", keyword: "required", params: { missingProperty: "message" }, message: "must have required property 'message'" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        if (data2.createdAt === void 0) {
          const err9 = { instancePath: instancePath + "/params", schemaPath: "./runtime.schema.json#/$defs/Event/required", keyword: "required", params: { missingProperty: "createdAt" }, message: "must have required property 'createdAt'" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
        if (data2.data === void 0) {
          const err10 = { instancePath: instancePath + "/params", schemaPath: "./runtime.schema.json#/$defs/Event/required", keyword: "required", params: { missingProperty: "data" }, message: "must have required property 'data'" };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
        for (const key1 in data2) {
          if (!(key1 === "id" || key1 === "type" || key1 === "message" || key1 === "createdAt" || key1 === "data")) {
            const err11 = { instancePath: instancePath + "/params", schemaPath: "./runtime.schema.json#/$defs/Event/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data2.id !== void 0) {
          let data3 = data2.id;
          if (!(typeof data3 == "number" && (!(data3 % 1) && !isNaN(data3)) && isFinite(data3))) {
            const err12 = { instancePath: instancePath + "/params/id", schemaPath: "./runtime.schema.json#/$defs/Event/properties/id/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data2.type !== void 0) {
          if (typeof data2.type !== "string") {
            const err13 = { instancePath: instancePath + "/params/type", schemaPath: "./runtime.schema.json#/$defs/Event/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data2.message !== void 0) {
          if (typeof data2.message !== "string") {
            const err14 = { instancePath: instancePath + "/params/message", schemaPath: "./runtime.schema.json#/$defs/Event/properties/message/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
        if (data2.createdAt !== void 0) {
          if (typeof data2.createdAt !== "string") {
            const err15 = { instancePath: instancePath + "/params/createdAt", schemaPath: "./runtime.schema.json#/$defs/Event/properties/createdAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
        if (data2.data !== void 0) {
          let data7 = data2.data;
          if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
          } else {
            const err16 = { instancePath: instancePath + "/params/data", schemaPath: "./runtime.schema.json#/$defs/Event/properties/data/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
        }
      } else {
        const err17 = { instancePath: instancePath + "/params", schemaPath: "./runtime.schema.json#/$defs/Event/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
  } else {
    const err18 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err18];
    } else {
      vErrors.push(err18);
    }
    errors++;
  }
  validate69.errors = vErrors;
  return errors === 0;
}
var validateDeviceFrameParams = validate70;
function validate70(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.deviceId === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "deviceId" }, message: "must have required property 'deviceId'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "deviceId")) {
        const err1 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
    if (data.deviceId !== void 0) {
      let data0 = data.deviceId;
      if (typeof data0 === "string") {
        if (func3(data0) > 200) {
          const err2 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (func3(data0) < 1) {
          const err3 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      } else {
        const err4 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
  } else {
    const err5 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err5];
    } else {
      vErrors.push(err5);
    }
    errors++;
  }
  validate70.errors = vErrors;
  return errors === 0;
}
var validateDeviceClickParams = validate71;
function validate71(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.deviceId === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "deviceId" }, message: "must have required property 'deviceId'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.frameId === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "frameId" }, message: "must have required property 'frameId'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.x === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "x" }, message: "must have required property 'x'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.y === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "y" }, message: "must have required property 'y'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.requestId === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "requestId" }, message: "must have required property 'requestId'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "deviceId" || key0 === "frameId" || key0 === "x" || key0 === "y" || key0 === "requestId")) {
        const err5 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.deviceId !== void 0) {
      let data0 = data.deviceId;
      if (typeof data0 === "string") {
        if (func3(data0) > 200) {
          const err6 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (func3(data0) < 1) {
          const err7 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      } else {
        const err8 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.frameId !== void 0) {
      let data1 = data.frameId;
      if (typeof data1 === "string") {
        if (func3(data1) > 200) {
          const err9 = { instancePath: instancePath + "/frameId", schemaPath: "#/properties/frameId/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
        if (func3(data1) < 1) {
          const err10 = { instancePath: instancePath + "/frameId", schemaPath: "#/properties/frameId/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      } else {
        const err11 = { instancePath: instancePath + "/frameId", schemaPath: "#/properties/frameId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.x !== void 0) {
      let data2 = data.x;
      if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
        const err12 = { instancePath: instancePath + "/x", schemaPath: "#/properties/x/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
      if (typeof data2 == "number" && isFinite(data2)) {
        if (data2 > 8191 || isNaN(data2)) {
          const err13 = { instancePath: instancePath + "/x", schemaPath: "#/properties/x/maximum", keyword: "maximum", params: { comparison: "<=", limit: 8191 }, message: "must be <= 8191" };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
        if (data2 < 0 || isNaN(data2)) {
          const err14 = { instancePath: instancePath + "/x", schemaPath: "#/properties/x/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
      }
    }
    if (data.y !== void 0) {
      let data3 = data.y;
      if (!(typeof data3 == "number" && (!(data3 % 1) && !isNaN(data3)) && isFinite(data3))) {
        const err15 = { instancePath: instancePath + "/y", schemaPath: "#/properties/y/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
      if (typeof data3 == "number" && isFinite(data3)) {
        if (data3 > 8191 || isNaN(data3)) {
          const err16 = { instancePath: instancePath + "/y", schemaPath: "#/properties/y/maximum", keyword: "maximum", params: { comparison: "<=", limit: 8191 }, message: "must be <= 8191" };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
        if (data3 < 0 || isNaN(data3)) {
          const err17 = { instancePath: instancePath + "/y", schemaPath: "#/properties/y/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
      }
    }
    if (data.requestId !== void 0) {
      let data4 = data.requestId;
      if (typeof data4 === "string") {
        if (func3(data4) > 200) {
          const err18 = { instancePath: instancePath + "/requestId", schemaPath: "#/properties/requestId/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
        if (func3(data4) < 1) {
          const err19 = { instancePath: instancePath + "/requestId", schemaPath: "#/properties/requestId/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
      } else {
        const err20 = { instancePath: instancePath + "/requestId", schemaPath: "#/properties/requestId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
    }
  } else {
    const err21 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err21];
    } else {
      vErrors.push(err21);
    }
    errors++;
  }
  validate71.errors = vErrors;
  return errors === 0;
}
var validateRunArtifactParams = validate72;
function validate72(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.runId === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.artifactId === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "artifactId" }, message: "must have required property 'artifactId'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "runId" || key0 === "artifactId")) {
        const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.runId !== void 0) {
      let data0 = data.runId;
      if (typeof data0 === "string") {
        if (func3(data0) > 200) {
          const err3 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (func3(data0) < 1) {
          const err4 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      } else {
        const err5 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.artifactId !== void 0) {
      let data1 = data.artifactId;
      if (typeof data1 === "string") {
        if (!pattern0.test(data1)) {
          const err6 = { instancePath: instancePath + "/artifactId", schemaPath: "#/properties/artifactId/pattern", keyword: "pattern", params: { pattern: "^[a-f0-9-]{36}$" }, message: 'must match pattern "^[a-f0-9-]{36}$"' };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      } else {
        const err7 = { instancePath: instancePath + "/artifactId", schemaPath: "#/properties/artifactId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
  } else {
    const err8 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err8];
    } else {
      vErrors.push(err8);
    }
    errors++;
  }
  validate72.errors = vErrors;
  return errors === 0;
}
var validateStageListParams = validate73;
var schema53 = { "enum": ["Official", "Bilibili", "YoStarEN", "YoStarJP", "YoStarKR", "txwy"] };
function validate73(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    for (const key0 in data) {
      if (!(key0 === "clientType" || key0 === "refresh")) {
        const err0 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
    }
    if (data.clientType !== void 0) {
      let data0 = data.clientType;
      if (!(data0 === "Official" || data0 === "Bilibili" || data0 === "YoStarEN" || data0 === "YoStarJP" || data0 === "YoStarKR" || data0 === "txwy")) {
        const err1 = { instancePath: instancePath + "/clientType", schemaPath: "#/$defs/ClientType/enum", keyword: "enum", params: { allowedValues: schema53.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
    if (data.refresh !== void 0) {
      if (typeof data.refresh !== "boolean") {
        const err2 = { instancePath: instancePath + "/refresh", schemaPath: "#/properties/refresh/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
  } else {
    const err3 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err3];
    } else {
      vErrors.push(err3);
    }
    errors++;
  }
  validate73.errors = vErrors;
  return errors === 0;
}
var validateStageListResult = validate74;
var schema74 = { "type": "object", "additionalProperties": false, "required": ["clientType", "resourceVersion", "source", "generatedAt", "stages", "activities", "calendar", "message", "diagnostics"], "properties": { "clientType": { "$ref": "#/$defs/ClientType" }, "resourceVersion": { "type": ["string", "null"], "maxLength": 200 }, "source": { "enum": ["installed", "builtin"] }, "generatedAt": { "type": "string", "maxLength": 40 }, "stages": { "type": "array", "maxItems": 2e3, "items": { "$ref": "#/$defs/StageOption" } }, "activities": { "type": "array", "maxItems": 100, "items": { "$ref": "#/$defs/StageActivity" } }, "calendar": { "$ref": "#/$defs/CalendarStatus" }, "message": { "type": "string", "maxLength": 1e3 }, "diagnostics": { "type": "array", "items": { "type": "string", "maxLength": 1e3 } } } };
var schema76 = { "type": "object", "additionalProperties": false, "required": ["value", "label", "category", "available"], "properties": { "value": { "type": "string", "maxLength": 200 }, "label": { "type": "string", "minLength": 1, "maxLength": 300 }, "category": { "enum": ["default", "activity", "permanent"] }, "available": { "type": "boolean" }, "tip": { "type": "string", "maxLength": 1e3 }, "activityId": { "type": "string", "maxLength": 200 } } };
var schema79 = { "type": "object", "additionalProperties": false, "required": ["source", "url", "fetchedAt", "checkedAt", "nextRefreshAt", "stale", "refreshing", "error"], "properties": { "source": { "enum": ["official-cache", "installed", "unavailable"] }, "url": { "type": ["string", "null"], "maxLength": 300 }, "fetchedAt": { "type": ["string", "null"], "maxLength": 40 }, "checkedAt": { "type": ["string", "null"], "maxLength": 40 }, "nextRefreshAt": { "type": ["string", "null"], "maxLength": 40 }, "stale": { "type": "boolean" }, "refreshing": { "type": "boolean" }, "error": { "type": ["string", "null"], "maxLength": 1e3 } } };
var schema77 = { "type": "object", "additionalProperties": false, "required": ["id", "name", "startAt", "endAt", "clientType", "status", "source"], "properties": { "id": { "type": "string", "minLength": 1, "maxLength": 200 }, "name": { "type": "string", "minLength": 1, "maxLength": 300 }, "startAt": { "type": ["string", "null"], "maxLength": 40 }, "endAt": { "type": ["string", "null"], "maxLength": 40 }, "clientType": { "$ref": "#/$defs/ClientType" }, "status": { "enum": ["active", "upcoming", "unknown"] }, "source": { "enum": ["official-calendar", "activity-metadata", "resource-version"] } } };
function validate45(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.id === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.name === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.startAt === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "startAt" }, message: "must have required property 'startAt'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.endAt === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "endAt" }, message: "must have required property 'endAt'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.clientType === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "clientType" }, message: "must have required property 'clientType'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.status === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.source === void 0) {
      const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "id" || key0 === "name" || key0 === "startAt" || key0 === "endAt" || key0 === "clientType" || key0 === "status" || key0 === "source")) {
        const err7 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.id !== void 0) {
      let data0 = data.id;
      if (typeof data0 === "string") {
        if (func3(data0) > 200) {
          const err8 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        if (func3(data0) < 1) {
          const err9 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      } else {
        const err10 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.name !== void 0) {
      let data1 = data.name;
      if (typeof data1 === "string") {
        if (func3(data1) > 300) {
          const err11 = { instancePath: instancePath + "/name", schemaPath: "#/properties/name/maxLength", keyword: "maxLength", params: { limit: 300 }, message: "must NOT have more than 300 characters" };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
        if (func3(data1) < 1) {
          const err12 = { instancePath: instancePath + "/name", schemaPath: "#/properties/name/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
      } else {
        const err13 = { instancePath: instancePath + "/name", schemaPath: "#/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
    if (data.startAt !== void 0) {
      let data2 = data.startAt;
      if (typeof data2 !== "string" && data2 !== null) {
        const err14 = { instancePath: instancePath + "/startAt", schemaPath: "#/properties/startAt/type", keyword: "type", params: { type: schema77.properties.startAt.type }, message: "must be string,null" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
      if (typeof data2 === "string") {
        if (func3(data2) > 40) {
          const err15 = { instancePath: instancePath + "/startAt", schemaPath: "#/properties/startAt/maxLength", keyword: "maxLength", params: { limit: 40 }, message: "must NOT have more than 40 characters" };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
      }
    }
    if (data.endAt !== void 0) {
      let data3 = data.endAt;
      if (typeof data3 !== "string" && data3 !== null) {
        const err16 = { instancePath: instancePath + "/endAt", schemaPath: "#/properties/endAt/type", keyword: "type", params: { type: schema77.properties.endAt.type }, message: "must be string,null" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
      if (typeof data3 === "string") {
        if (func3(data3) > 40) {
          const err17 = { instancePath: instancePath + "/endAt", schemaPath: "#/properties/endAt/maxLength", keyword: "maxLength", params: { limit: 40 }, message: "must NOT have more than 40 characters" };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
      }
    }
    if (data.clientType !== void 0) {
      let data4 = data.clientType;
      if (!(data4 === "Official" || data4 === "Bilibili" || data4 === "YoStarEN" || data4 === "YoStarJP" || data4 === "YoStarKR" || data4 === "txwy")) {
        const err18 = { instancePath: instancePath + "/clientType", schemaPath: "#/$defs/ClientType/enum", keyword: "enum", params: { allowedValues: schema53.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
    }
    if (data.status !== void 0) {
      let data5 = data.status;
      if (!(data5 === "active" || data5 === "upcoming" || data5 === "unknown")) {
        const err19 = { instancePath: instancePath + "/status", schemaPath: "#/properties/status/enum", keyword: "enum", params: { allowedValues: schema77.properties.status.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
    }
    if (data.source !== void 0) {
      let data6 = data.source;
      if (!(data6 === "official-calendar" || data6 === "activity-metadata" || data6 === "resource-version")) {
        const err20 = { instancePath: instancePath + "/source", schemaPath: "#/properties/source/enum", keyword: "enum", params: { allowedValues: schema77.properties.source.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
    }
  } else {
    const err21 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err21];
    } else {
      vErrors.push(err21);
    }
    errors++;
  }
  validate45.errors = vErrors;
  return errors === 0;
}
function validate74(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.clientType === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "clientType" }, message: "must have required property 'clientType'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.resourceVersion === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "resourceVersion" }, message: "must have required property 'resourceVersion'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.source === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.generatedAt === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "generatedAt" }, message: "must have required property 'generatedAt'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.stages === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "stages" }, message: "must have required property 'stages'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.activities === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "activities" }, message: "must have required property 'activities'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.calendar === void 0) {
      const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "calendar" }, message: "must have required property 'calendar'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.message === void 0) {
      const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "message" }, message: "must have required property 'message'" };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.diagnostics === void 0) {
      const err8 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "diagnostics" }, message: "must have required property 'diagnostics'" };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func2.call(schema74.properties, key0)) {
        const err9 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.clientType !== void 0) {
      let data0 = data.clientType;
      if (!(data0 === "Official" || data0 === "Bilibili" || data0 === "YoStarEN" || data0 === "YoStarJP" || data0 === "YoStarKR" || data0 === "txwy")) {
        const err10 = { instancePath: instancePath + "/clientType", schemaPath: "#/$defs/ClientType/enum", keyword: "enum", params: { allowedValues: schema53.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.resourceVersion !== void 0) {
      let data1 = data.resourceVersion;
      if (typeof data1 !== "string" && data1 !== null) {
        const err11 = { instancePath: instancePath + "/resourceVersion", schemaPath: "#/properties/resourceVersion/type", keyword: "type", params: { type: schema74.properties.resourceVersion.type }, message: "must be string,null" };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
      if (typeof data1 === "string") {
        if (func3(data1) > 200) {
          const err12 = { instancePath: instancePath + "/resourceVersion", schemaPath: "#/properties/resourceVersion/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
      }
    }
    if (data.source !== void 0) {
      let data2 = data.source;
      if (!(data2 === "installed" || data2 === "builtin")) {
        const err13 = { instancePath: instancePath + "/source", schemaPath: "#/properties/source/enum", keyword: "enum", params: { allowedValues: schema74.properties.source.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
    if (data.generatedAt !== void 0) {
      let data3 = data.generatedAt;
      if (typeof data3 === "string") {
        if (func3(data3) > 40) {
          const err14 = { instancePath: instancePath + "/generatedAt", schemaPath: "#/properties/generatedAt/maxLength", keyword: "maxLength", params: { limit: 40 }, message: "must NOT have more than 40 characters" };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
      } else {
        const err15 = { instancePath: instancePath + "/generatedAt", schemaPath: "#/properties/generatedAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.stages !== void 0) {
      let data4 = data.stages;
      if (Array.isArray(data4)) {
        if (data4.length > 2e3) {
          const err16 = { instancePath: instancePath + "/stages", schemaPath: "#/properties/stages/maxItems", keyword: "maxItems", params: { limit: 2e3 }, message: "must NOT have more than 2000 items" };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
        const len0 = data4.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data5 = data4[i0];
          if (data5 && typeof data5 == "object" && !Array.isArray(data5)) {
            if (data5.value === void 0) {
              const err17 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/$defs/StageOption/required", keyword: "required", params: { missingProperty: "value" }, message: "must have required property 'value'" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
            if (data5.label === void 0) {
              const err18 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/$defs/StageOption/required", keyword: "required", params: { missingProperty: "label" }, message: "must have required property 'label'" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
            if (data5.category === void 0) {
              const err19 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/$defs/StageOption/required", keyword: "required", params: { missingProperty: "category" }, message: "must have required property 'category'" };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
            if (data5.available === void 0) {
              const err20 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/$defs/StageOption/required", keyword: "required", params: { missingProperty: "available" }, message: "must have required property 'available'" };
              if (vErrors === null) {
                vErrors = [err20];
              } else {
                vErrors.push(err20);
              }
              errors++;
            }
            for (const key1 in data5) {
              if (!(key1 === "value" || key1 === "label" || key1 === "category" || key1 === "available" || key1 === "tip" || key1 === "activityId")) {
                const err21 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/$defs/StageOption/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err21];
                } else {
                  vErrors.push(err21);
                }
                errors++;
              }
            }
            if (data5.value !== void 0) {
              let data6 = data5.value;
              if (typeof data6 === "string") {
                if (func3(data6) > 200) {
                  const err22 = { instancePath: instancePath + "/stages/" + i0 + "/value", schemaPath: "#/$defs/StageOption/properties/value/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                  if (vErrors === null) {
                    vErrors = [err22];
                  } else {
                    vErrors.push(err22);
                  }
                  errors++;
                }
              } else {
                const err23 = { instancePath: instancePath + "/stages/" + i0 + "/value", schemaPath: "#/$defs/StageOption/properties/value/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err23];
                } else {
                  vErrors.push(err23);
                }
                errors++;
              }
            }
            if (data5.label !== void 0) {
              let data7 = data5.label;
              if (typeof data7 === "string") {
                if (func3(data7) > 300) {
                  const err24 = { instancePath: instancePath + "/stages/" + i0 + "/label", schemaPath: "#/$defs/StageOption/properties/label/maxLength", keyword: "maxLength", params: { limit: 300 }, message: "must NOT have more than 300 characters" };
                  if (vErrors === null) {
                    vErrors = [err24];
                  } else {
                    vErrors.push(err24);
                  }
                  errors++;
                }
                if (func3(data7) < 1) {
                  const err25 = { instancePath: instancePath + "/stages/" + i0 + "/label", schemaPath: "#/$defs/StageOption/properties/label/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err25];
                  } else {
                    vErrors.push(err25);
                  }
                  errors++;
                }
              } else {
                const err26 = { instancePath: instancePath + "/stages/" + i0 + "/label", schemaPath: "#/$defs/StageOption/properties/label/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err26];
                } else {
                  vErrors.push(err26);
                }
                errors++;
              }
            }
            if (data5.category !== void 0) {
              let data8 = data5.category;
              if (!(data8 === "default" || data8 === "activity" || data8 === "permanent")) {
                const err27 = { instancePath: instancePath + "/stages/" + i0 + "/category", schemaPath: "#/$defs/StageOption/properties/category/enum", keyword: "enum", params: { allowedValues: schema76.properties.category.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err27];
                } else {
                  vErrors.push(err27);
                }
                errors++;
              }
            }
            if (data5.available !== void 0) {
              if (typeof data5.available !== "boolean") {
                const err28 = { instancePath: instancePath + "/stages/" + i0 + "/available", schemaPath: "#/$defs/StageOption/properties/available/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                if (vErrors === null) {
                  vErrors = [err28];
                } else {
                  vErrors.push(err28);
                }
                errors++;
              }
            }
            if (data5.tip !== void 0) {
              let data10 = data5.tip;
              if (typeof data10 === "string") {
                if (func3(data10) > 1e3) {
                  const err29 = { instancePath: instancePath + "/stages/" + i0 + "/tip", schemaPath: "#/$defs/StageOption/properties/tip/maxLength", keyword: "maxLength", params: { limit: 1e3 }, message: "must NOT have more than 1000 characters" };
                  if (vErrors === null) {
                    vErrors = [err29];
                  } else {
                    vErrors.push(err29);
                  }
                  errors++;
                }
              } else {
                const err30 = { instancePath: instancePath + "/stages/" + i0 + "/tip", schemaPath: "#/$defs/StageOption/properties/tip/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err30];
                } else {
                  vErrors.push(err30);
                }
                errors++;
              }
            }
            if (data5.activityId !== void 0) {
              let data11 = data5.activityId;
              if (typeof data11 === "string") {
                if (func3(data11) > 200) {
                  const err31 = { instancePath: instancePath + "/stages/" + i0 + "/activityId", schemaPath: "#/$defs/StageOption/properties/activityId/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                  if (vErrors === null) {
                    vErrors = [err31];
                  } else {
                    vErrors.push(err31);
                  }
                  errors++;
                }
              } else {
                const err32 = { instancePath: instancePath + "/stages/" + i0 + "/activityId", schemaPath: "#/$defs/StageOption/properties/activityId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err32];
                } else {
                  vErrors.push(err32);
                }
                errors++;
              }
            }
          } else {
            const err33 = { instancePath: instancePath + "/stages/" + i0, schemaPath: "#/$defs/StageOption/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err33];
            } else {
              vErrors.push(err33);
            }
            errors++;
          }
        }
      } else {
        const err34 = { instancePath: instancePath + "/stages", schemaPath: "#/properties/stages/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err34];
        } else {
          vErrors.push(err34);
        }
        errors++;
      }
    }
    if (data.activities !== void 0) {
      let data12 = data.activities;
      if (Array.isArray(data12)) {
        if (data12.length > 100) {
          const err35 = { instancePath: instancePath + "/activities", schemaPath: "#/properties/activities/maxItems", keyword: "maxItems", params: { limit: 100 }, message: "must NOT have more than 100 items" };
          if (vErrors === null) {
            vErrors = [err35];
          } else {
            vErrors.push(err35);
          }
          errors++;
        }
        const len1 = data12.length;
        for (let i1 = 0; i1 < len1; i1++) {
          if (!validate45(data12[i1], { instancePath: instancePath + "/activities/" + i1, parentData: data12, parentDataProperty: i1, rootData })) {
            vErrors = vErrors === null ? validate45.errors : vErrors.concat(validate45.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err36 = { instancePath: instancePath + "/activities", schemaPath: "#/properties/activities/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err36];
        } else {
          vErrors.push(err36);
        }
        errors++;
      }
    }
    if (data.calendar !== void 0) {
      let data14 = data.calendar;
      if (data14 && typeof data14 == "object" && !Array.isArray(data14)) {
        if (data14.source === void 0) {
          const err37 = { instancePath: instancePath + "/calendar", schemaPath: "#/$defs/CalendarStatus/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
          if (vErrors === null) {
            vErrors = [err37];
          } else {
            vErrors.push(err37);
          }
          errors++;
        }
        if (data14.url === void 0) {
          const err38 = { instancePath: instancePath + "/calendar", schemaPath: "#/$defs/CalendarStatus/required", keyword: "required", params: { missingProperty: "url" }, message: "must have required property 'url'" };
          if (vErrors === null) {
            vErrors = [err38];
          } else {
            vErrors.push(err38);
          }
          errors++;
        }
        if (data14.fetchedAt === void 0) {
          const err39 = { instancePath: instancePath + "/calendar", schemaPath: "#/$defs/CalendarStatus/required", keyword: "required", params: { missingProperty: "fetchedAt" }, message: "must have required property 'fetchedAt'" };
          if (vErrors === null) {
            vErrors = [err39];
          } else {
            vErrors.push(err39);
          }
          errors++;
        }
        if (data14.checkedAt === void 0) {
          const err40 = { instancePath: instancePath + "/calendar", schemaPath: "#/$defs/CalendarStatus/required", keyword: "required", params: { missingProperty: "checkedAt" }, message: "must have required property 'checkedAt'" };
          if (vErrors === null) {
            vErrors = [err40];
          } else {
            vErrors.push(err40);
          }
          errors++;
        }
        if (data14.nextRefreshAt === void 0) {
          const err41 = { instancePath: instancePath + "/calendar", schemaPath: "#/$defs/CalendarStatus/required", keyword: "required", params: { missingProperty: "nextRefreshAt" }, message: "must have required property 'nextRefreshAt'" };
          if (vErrors === null) {
            vErrors = [err41];
          } else {
            vErrors.push(err41);
          }
          errors++;
        }
        if (data14.stale === void 0) {
          const err42 = { instancePath: instancePath + "/calendar", schemaPath: "#/$defs/CalendarStatus/required", keyword: "required", params: { missingProperty: "stale" }, message: "must have required property 'stale'" };
          if (vErrors === null) {
            vErrors = [err42];
          } else {
            vErrors.push(err42);
          }
          errors++;
        }
        if (data14.refreshing === void 0) {
          const err43 = { instancePath: instancePath + "/calendar", schemaPath: "#/$defs/CalendarStatus/required", keyword: "required", params: { missingProperty: "refreshing" }, message: "must have required property 'refreshing'" };
          if (vErrors === null) {
            vErrors = [err43];
          } else {
            vErrors.push(err43);
          }
          errors++;
        }
        if (data14.error === void 0) {
          const err44 = { instancePath: instancePath + "/calendar", schemaPath: "#/$defs/CalendarStatus/required", keyword: "required", params: { missingProperty: "error" }, message: "must have required property 'error'" };
          if (vErrors === null) {
            vErrors = [err44];
          } else {
            vErrors.push(err44);
          }
          errors++;
        }
        for (const key2 in data14) {
          if (!(key2 === "source" || key2 === "url" || key2 === "fetchedAt" || key2 === "checkedAt" || key2 === "nextRefreshAt" || key2 === "stale" || key2 === "refreshing" || key2 === "error")) {
            const err45 = { instancePath: instancePath + "/calendar", schemaPath: "#/$defs/CalendarStatus/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err45];
            } else {
              vErrors.push(err45);
            }
            errors++;
          }
        }
        if (data14.source !== void 0) {
          let data15 = data14.source;
          if (!(data15 === "official-cache" || data15 === "installed" || data15 === "unavailable")) {
            const err46 = { instancePath: instancePath + "/calendar/source", schemaPath: "#/$defs/CalendarStatus/properties/source/enum", keyword: "enum", params: { allowedValues: schema79.properties.source.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err46];
            } else {
              vErrors.push(err46);
            }
            errors++;
          }
        }
        if (data14.url !== void 0) {
          let data16 = data14.url;
          if (typeof data16 !== "string" && data16 !== null) {
            const err47 = { instancePath: instancePath + "/calendar/url", schemaPath: "#/$defs/CalendarStatus/properties/url/type", keyword: "type", params: { type: schema79.properties.url.type }, message: "must be string,null" };
            if (vErrors === null) {
              vErrors = [err47];
            } else {
              vErrors.push(err47);
            }
            errors++;
          }
          if (typeof data16 === "string") {
            if (func3(data16) > 300) {
              const err48 = { instancePath: instancePath + "/calendar/url", schemaPath: "#/$defs/CalendarStatus/properties/url/maxLength", keyword: "maxLength", params: { limit: 300 }, message: "must NOT have more than 300 characters" };
              if (vErrors === null) {
                vErrors = [err48];
              } else {
                vErrors.push(err48);
              }
              errors++;
            }
          }
        }
        if (data14.fetchedAt !== void 0) {
          let data17 = data14.fetchedAt;
          if (typeof data17 !== "string" && data17 !== null) {
            const err49 = { instancePath: instancePath + "/calendar/fetchedAt", schemaPath: "#/$defs/CalendarStatus/properties/fetchedAt/type", keyword: "type", params: { type: schema79.properties.fetchedAt.type }, message: "must be string,null" };
            if (vErrors === null) {
              vErrors = [err49];
            } else {
              vErrors.push(err49);
            }
            errors++;
          }
          if (typeof data17 === "string") {
            if (func3(data17) > 40) {
              const err50 = { instancePath: instancePath + "/calendar/fetchedAt", schemaPath: "#/$defs/CalendarStatus/properties/fetchedAt/maxLength", keyword: "maxLength", params: { limit: 40 }, message: "must NOT have more than 40 characters" };
              if (vErrors === null) {
                vErrors = [err50];
              } else {
                vErrors.push(err50);
              }
              errors++;
            }
          }
        }
        if (data14.checkedAt !== void 0) {
          let data18 = data14.checkedAt;
          if (typeof data18 !== "string" && data18 !== null) {
            const err51 = { instancePath: instancePath + "/calendar/checkedAt", schemaPath: "#/$defs/CalendarStatus/properties/checkedAt/type", keyword: "type", params: { type: schema79.properties.checkedAt.type }, message: "must be string,null" };
            if (vErrors === null) {
              vErrors = [err51];
            } else {
              vErrors.push(err51);
            }
            errors++;
          }
          if (typeof data18 === "string") {
            if (func3(data18) > 40) {
              const err52 = { instancePath: instancePath + "/calendar/checkedAt", schemaPath: "#/$defs/CalendarStatus/properties/checkedAt/maxLength", keyword: "maxLength", params: { limit: 40 }, message: "must NOT have more than 40 characters" };
              if (vErrors === null) {
                vErrors = [err52];
              } else {
                vErrors.push(err52);
              }
              errors++;
            }
          }
        }
        if (data14.nextRefreshAt !== void 0) {
          let data19 = data14.nextRefreshAt;
          if (typeof data19 !== "string" && data19 !== null) {
            const err53 = { instancePath: instancePath + "/calendar/nextRefreshAt", schemaPath: "#/$defs/CalendarStatus/properties/nextRefreshAt/type", keyword: "type", params: { type: schema79.properties.nextRefreshAt.type }, message: "must be string,null" };
            if (vErrors === null) {
              vErrors = [err53];
            } else {
              vErrors.push(err53);
            }
            errors++;
          }
          if (typeof data19 === "string") {
            if (func3(data19) > 40) {
              const err54 = { instancePath: instancePath + "/calendar/nextRefreshAt", schemaPath: "#/$defs/CalendarStatus/properties/nextRefreshAt/maxLength", keyword: "maxLength", params: { limit: 40 }, message: "must NOT have more than 40 characters" };
              if (vErrors === null) {
                vErrors = [err54];
              } else {
                vErrors.push(err54);
              }
              errors++;
            }
          }
        }
        if (data14.stale !== void 0) {
          if (typeof data14.stale !== "boolean") {
            const err55 = { instancePath: instancePath + "/calendar/stale", schemaPath: "#/$defs/CalendarStatus/properties/stale/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err55];
            } else {
              vErrors.push(err55);
            }
            errors++;
          }
        }
        if (data14.refreshing !== void 0) {
          if (typeof data14.refreshing !== "boolean") {
            const err56 = { instancePath: instancePath + "/calendar/refreshing", schemaPath: "#/$defs/CalendarStatus/properties/refreshing/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err56];
            } else {
              vErrors.push(err56);
            }
            errors++;
          }
        }
        if (data14.error !== void 0) {
          let data22 = data14.error;
          if (typeof data22 !== "string" && data22 !== null) {
            const err57 = { instancePath: instancePath + "/calendar/error", schemaPath: "#/$defs/CalendarStatus/properties/error/type", keyword: "type", params: { type: schema79.properties.error.type }, message: "must be string,null" };
            if (vErrors === null) {
              vErrors = [err57];
            } else {
              vErrors.push(err57);
            }
            errors++;
          }
          if (typeof data22 === "string") {
            if (func3(data22) > 1e3) {
              const err58 = { instancePath: instancePath + "/calendar/error", schemaPath: "#/$defs/CalendarStatus/properties/error/maxLength", keyword: "maxLength", params: { limit: 1e3 }, message: "must NOT have more than 1000 characters" };
              if (vErrors === null) {
                vErrors = [err58];
              } else {
                vErrors.push(err58);
              }
              errors++;
            }
          }
        }
      } else {
        const err59 = { instancePath: instancePath + "/calendar", schemaPath: "#/$defs/CalendarStatus/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err59];
        } else {
          vErrors.push(err59);
        }
        errors++;
      }
    }
    if (data.message !== void 0) {
      let data23 = data.message;
      if (typeof data23 === "string") {
        if (func3(data23) > 1e3) {
          const err60 = { instancePath: instancePath + "/message", schemaPath: "#/properties/message/maxLength", keyword: "maxLength", params: { limit: 1e3 }, message: "must NOT have more than 1000 characters" };
          if (vErrors === null) {
            vErrors = [err60];
          } else {
            vErrors.push(err60);
          }
          errors++;
        }
      } else {
        const err61 = { instancePath: instancePath + "/message", schemaPath: "#/properties/message/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err61];
        } else {
          vErrors.push(err61);
        }
        errors++;
      }
    }
    if (data.diagnostics !== void 0) {
      let data24 = data.diagnostics;
      if (Array.isArray(data24)) {
        const len2 = data24.length;
        for (let i2 = 0; i2 < len2; i2++) {
          let data25 = data24[i2];
          if (typeof data25 === "string") {
            if (func3(data25) > 1e3) {
              const err62 = { instancePath: instancePath + "/diagnostics/" + i2, schemaPath: "#/properties/diagnostics/items/maxLength", keyword: "maxLength", params: { limit: 1e3 }, message: "must NOT have more than 1000 characters" };
              if (vErrors === null) {
                vErrors = [err62];
              } else {
                vErrors.push(err62);
              }
              errors++;
            }
          } else {
            const err63 = { instancePath: instancePath + "/diagnostics/" + i2, schemaPath: "#/properties/diagnostics/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err63];
            } else {
              vErrors.push(err63);
            }
            errors++;
          }
        }
      } else {
        const err64 = { instancePath: instancePath + "/diagnostics", schemaPath: "#/properties/diagnostics/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err64];
        } else {
          vErrors.push(err64);
        }
        errors++;
      }
    }
  } else {
    const err65 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err65];
    } else {
      vErrors.push(err65);
    }
    errors++;
  }
  validate74.errors = vErrors;
  return errors === 0;
}
var validateRecognitionParams = validate76;
var schema54 = { "type": "object", "additionalProperties": false, "required": ["deviceId", "kind"], "properties": { "deviceId": { "type": "string", "minLength": 1, "maxLength": 200 }, "kind": { "enum": ["depot", "operators"] }, "clientType": { "$ref": "#/$defs/ClientType" } } };
function validate76(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.deviceId === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "deviceId" }, message: "must have required property 'deviceId'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.kind === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "deviceId" || key0 === "kind" || key0 === "clientType")) {
        const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.deviceId !== void 0) {
      let data0 = data.deviceId;
      if (typeof data0 === "string") {
        if (func3(data0) > 200) {
          const err3 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (func3(data0) < 1) {
          const err4 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      } else {
        const err5 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.kind !== void 0) {
      let data1 = data.kind;
      if (!(data1 === "depot" || data1 === "operators")) {
        const err6 = { instancePath: instancePath + "/kind", schemaPath: "#/properties/kind/enum", keyword: "enum", params: { allowedValues: schema54.properties.kind.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.clientType !== void 0) {
      let data2 = data.clientType;
      if (!(data2 === "Official" || data2 === "Bilibili" || data2 === "YoStarEN" || data2 === "YoStarJP" || data2 === "YoStarKR" || data2 === "txwy")) {
        const err7 = { instancePath: instancePath + "/clientType", schemaPath: "#/$defs/ClientType/enum", keyword: "enum", params: { allowedValues: schema53.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
  } else {
    const err8 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err8];
    } else {
      vErrors.push(err8);
    }
    errors++;
  }
  validate76.errors = vErrors;
  return errors === 0;
}
var validateRecognitionResult = validate77;
var schema81 = { "type": "object", "additionalProperties": false, "required": ["deviceId", "kind", "clientType", "collectedAt", "runId", "items", "operators"], "properties": { "deviceId": { "type": "string", "minLength": 1, "maxLength": 200 }, "kind": { "enum": ["depot", "operators"] }, "clientType": { "$ref": "#/$defs/ClientType" }, "collectedAt": { "type": ["string", "null"], "minLength": 1, "maxLength": 40 }, "runId": { "type": ["string", "null"], "minLength": 1, "maxLength": 200 }, "items": { "type": "array", "maxItems": 1e4, "items": { "$ref": "#/$defs/RecognizedItem" } }, "operators": { "type": "array", "maxItems": 2e3, "items": { "$ref": "#/$defs/RecognizedOperator" } } } };
function validate77(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.deviceId === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "deviceId" }, message: "must have required property 'deviceId'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.kind === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.clientType === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "clientType" }, message: "must have required property 'clientType'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.collectedAt === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "collectedAt" }, message: "must have required property 'collectedAt'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.runId === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.items === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "items" }, message: "must have required property 'items'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.operators === void 0) {
      const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "operators" }, message: "must have required property 'operators'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "deviceId" || key0 === "kind" || key0 === "clientType" || key0 === "collectedAt" || key0 === "runId" || key0 === "items" || key0 === "operators")) {
        const err7 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.deviceId !== void 0) {
      let data0 = data.deviceId;
      if (typeof data0 === "string") {
        if (func3(data0) > 200) {
          const err8 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        if (func3(data0) < 1) {
          const err9 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      } else {
        const err10 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.kind !== void 0) {
      let data1 = data.kind;
      if (!(data1 === "depot" || data1 === "operators")) {
        const err11 = { instancePath: instancePath + "/kind", schemaPath: "#/properties/kind/enum", keyword: "enum", params: { allowedValues: schema81.properties.kind.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.clientType !== void 0) {
      let data2 = data.clientType;
      if (!(data2 === "Official" || data2 === "Bilibili" || data2 === "YoStarEN" || data2 === "YoStarJP" || data2 === "YoStarKR" || data2 === "txwy")) {
        const err12 = { instancePath: instancePath + "/clientType", schemaPath: "#/$defs/ClientType/enum", keyword: "enum", params: { allowedValues: schema53.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.collectedAt !== void 0) {
      let data3 = data.collectedAt;
      if (typeof data3 !== "string" && data3 !== null) {
        const err13 = { instancePath: instancePath + "/collectedAt", schemaPath: "#/properties/collectedAt/type", keyword: "type", params: { type: schema81.properties.collectedAt.type }, message: "must be string,null" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
      if (typeof data3 === "string") {
        if (func3(data3) > 40) {
          const err14 = { instancePath: instancePath + "/collectedAt", schemaPath: "#/properties/collectedAt/maxLength", keyword: "maxLength", params: { limit: 40 }, message: "must NOT have more than 40 characters" };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
        if (func3(data3) < 1) {
          const err15 = { instancePath: instancePath + "/collectedAt", schemaPath: "#/properties/collectedAt/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
      }
    }
    if (data.runId !== void 0) {
      let data4 = data.runId;
      if (typeof data4 !== "string" && data4 !== null) {
        const err16 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/type", keyword: "type", params: { type: schema81.properties.runId.type }, message: "must be string,null" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
      if (typeof data4 === "string") {
        if (func3(data4) > 200) {
          const err17 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
        if (func3(data4) < 1) {
          const err18 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
      }
    }
    if (data.items !== void 0) {
      let data5 = data.items;
      if (Array.isArray(data5)) {
        if (data5.length > 1e4) {
          const err19 = { instancePath: instancePath + "/items", schemaPath: "#/properties/items/maxItems", keyword: "maxItems", params: { limit: 1e4 }, message: "must NOT have more than 10000 items" };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
        const len0 = data5.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data6 = data5[i0];
          if (data6 && typeof data6 == "object" && !Array.isArray(data6)) {
            if (data6.id === void 0) {
              const err20 = { instancePath: instancePath + "/items/" + i0, schemaPath: "#/$defs/RecognizedItem/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
              if (vErrors === null) {
                vErrors = [err20];
              } else {
                vErrors.push(err20);
              }
              errors++;
            }
            if (data6.name === void 0) {
              const err21 = { instancePath: instancePath + "/items/" + i0, schemaPath: "#/$defs/RecognizedItem/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
            if (data6.quantity === void 0) {
              const err22 = { instancePath: instancePath + "/items/" + i0, schemaPath: "#/$defs/RecognizedItem/required", keyword: "required", params: { missingProperty: "quantity" }, message: "must have required property 'quantity'" };
              if (vErrors === null) {
                vErrors = [err22];
              } else {
                vErrors.push(err22);
              }
              errors++;
            }
            for (const key1 in data6) {
              if (!(key1 === "id" || key1 === "name" || key1 === "quantity")) {
                const err23 = { instancePath: instancePath + "/items/" + i0, schemaPath: "#/$defs/RecognizedItem/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err23];
                } else {
                  vErrors.push(err23);
                }
                errors++;
              }
            }
            if (data6.id !== void 0) {
              let data7 = data6.id;
              if (typeof data7 === "string") {
                if (func3(data7) > 200) {
                  const err24 = { instancePath: instancePath + "/items/" + i0 + "/id", schemaPath: "#/$defs/RecognizedItem/properties/id/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                  if (vErrors === null) {
                    vErrors = [err24];
                  } else {
                    vErrors.push(err24);
                  }
                  errors++;
                }
                if (func3(data7) < 1) {
                  const err25 = { instancePath: instancePath + "/items/" + i0 + "/id", schemaPath: "#/$defs/RecognizedItem/properties/id/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err25];
                  } else {
                    vErrors.push(err25);
                  }
                  errors++;
                }
              } else {
                const err26 = { instancePath: instancePath + "/items/" + i0 + "/id", schemaPath: "#/$defs/RecognizedItem/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err26];
                } else {
                  vErrors.push(err26);
                }
                errors++;
              }
            }
            if (data6.name !== void 0) {
              let data8 = data6.name;
              if (typeof data8 === "string") {
                if (func3(data8) > 300) {
                  const err27 = { instancePath: instancePath + "/items/" + i0 + "/name", schemaPath: "#/$defs/RecognizedItem/properties/name/maxLength", keyword: "maxLength", params: { limit: 300 }, message: "must NOT have more than 300 characters" };
                  if (vErrors === null) {
                    vErrors = [err27];
                  } else {
                    vErrors.push(err27);
                  }
                  errors++;
                }
                if (func3(data8) < 1) {
                  const err28 = { instancePath: instancePath + "/items/" + i0 + "/name", schemaPath: "#/$defs/RecognizedItem/properties/name/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err28];
                  } else {
                    vErrors.push(err28);
                  }
                  errors++;
                }
              } else {
                const err29 = { instancePath: instancePath + "/items/" + i0 + "/name", schemaPath: "#/$defs/RecognizedItem/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err29];
                } else {
                  vErrors.push(err29);
                }
                errors++;
              }
            }
            if (data6.quantity !== void 0) {
              let data9 = data6.quantity;
              if (!(typeof data9 == "number" && (!(data9 % 1) && !isNaN(data9)) && isFinite(data9))) {
                const err30 = { instancePath: instancePath + "/items/" + i0 + "/quantity", schemaPath: "#/$defs/RecognizedItem/properties/quantity/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err30];
                } else {
                  vErrors.push(err30);
                }
                errors++;
              }
              if (typeof data9 == "number" && isFinite(data9)) {
                if (data9 > 2147483647 || isNaN(data9)) {
                  const err31 = { instancePath: instancePath + "/items/" + i0 + "/quantity", schemaPath: "#/$defs/RecognizedItem/properties/quantity/maximum", keyword: "maximum", params: { comparison: "<=", limit: 2147483647 }, message: "must be <= 2147483647" };
                  if (vErrors === null) {
                    vErrors = [err31];
                  } else {
                    vErrors.push(err31);
                  }
                  errors++;
                }
                if (data9 < 1 || isNaN(data9)) {
                  const err32 = { instancePath: instancePath + "/items/" + i0 + "/quantity", schemaPath: "#/$defs/RecognizedItem/properties/quantity/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                  if (vErrors === null) {
                    vErrors = [err32];
                  } else {
                    vErrors.push(err32);
                  }
                  errors++;
                }
              }
            }
          } else {
            const err33 = { instancePath: instancePath + "/items/" + i0, schemaPath: "#/$defs/RecognizedItem/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err33];
            } else {
              vErrors.push(err33);
            }
            errors++;
          }
        }
      } else {
        const err34 = { instancePath: instancePath + "/items", schemaPath: "#/properties/items/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err34];
        } else {
          vErrors.push(err34);
        }
        errors++;
      }
    }
    if (data.operators !== void 0) {
      let data10 = data.operators;
      if (Array.isArray(data10)) {
        if (data10.length > 2e3) {
          const err35 = { instancePath: instancePath + "/operators", schemaPath: "#/properties/operators/maxItems", keyword: "maxItems", params: { limit: 2e3 }, message: "must NOT have more than 2000 items" };
          if (vErrors === null) {
            vErrors = [err35];
          } else {
            vErrors.push(err35);
          }
          errors++;
        }
        const len1 = data10.length;
        for (let i1 = 0; i1 < len1; i1++) {
          let data11 = data10[i1];
          if (data11 && typeof data11 == "object" && !Array.isArray(data11)) {
            if (data11.id === void 0) {
              const err36 = { instancePath: instancePath + "/operators/" + i1, schemaPath: "#/$defs/RecognizedOperator/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
              if (vErrors === null) {
                vErrors = [err36];
              } else {
                vErrors.push(err36);
              }
              errors++;
            }
            if (data11.name === void 0) {
              const err37 = { instancePath: instancePath + "/operators/" + i1, schemaPath: "#/$defs/RecognizedOperator/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
              if (vErrors === null) {
                vErrors = [err37];
              } else {
                vErrors.push(err37);
              }
              errors++;
            }
            if (data11.own === void 0) {
              const err38 = { instancePath: instancePath + "/operators/" + i1, schemaPath: "#/$defs/RecognizedOperator/required", keyword: "required", params: { missingProperty: "own" }, message: "must have required property 'own'" };
              if (vErrors === null) {
                vErrors = [err38];
              } else {
                vErrors.push(err38);
              }
              errors++;
            }
            if (data11.elite === void 0) {
              const err39 = { instancePath: instancePath + "/operators/" + i1, schemaPath: "#/$defs/RecognizedOperator/required", keyword: "required", params: { missingProperty: "elite" }, message: "must have required property 'elite'" };
              if (vErrors === null) {
                vErrors = [err39];
              } else {
                vErrors.push(err39);
              }
              errors++;
            }
            if (data11.level === void 0) {
              const err40 = { instancePath: instancePath + "/operators/" + i1, schemaPath: "#/$defs/RecognizedOperator/required", keyword: "required", params: { missingProperty: "level" }, message: "must have required property 'level'" };
              if (vErrors === null) {
                vErrors = [err40];
              } else {
                vErrors.push(err40);
              }
              errors++;
            }
            if (data11.potential === void 0) {
              const err41 = { instancePath: instancePath + "/operators/" + i1, schemaPath: "#/$defs/RecognizedOperator/required", keyword: "required", params: { missingProperty: "potential" }, message: "must have required property 'potential'" };
              if (vErrors === null) {
                vErrors = [err41];
              } else {
                vErrors.push(err41);
              }
              errors++;
            }
            if (data11.rarity === void 0) {
              const err42 = { instancePath: instancePath + "/operators/" + i1, schemaPath: "#/$defs/RecognizedOperator/required", keyword: "required", params: { missingProperty: "rarity" }, message: "must have required property 'rarity'" };
              if (vErrors === null) {
                vErrors = [err42];
              } else {
                vErrors.push(err42);
              }
              errors++;
            }
            for (const key2 in data11) {
              if (!(key2 === "id" || key2 === "name" || key2 === "own" || key2 === "elite" || key2 === "level" || key2 === "potential" || key2 === "rarity")) {
                const err43 = { instancePath: instancePath + "/operators/" + i1, schemaPath: "#/$defs/RecognizedOperator/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err43];
                } else {
                  vErrors.push(err43);
                }
                errors++;
              }
            }
            if (data11.id !== void 0) {
              let data12 = data11.id;
              if (typeof data12 === "string") {
                if (func3(data12) > 200) {
                  const err44 = { instancePath: instancePath + "/operators/" + i1 + "/id", schemaPath: "#/$defs/RecognizedOperator/properties/id/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
                  if (vErrors === null) {
                    vErrors = [err44];
                  } else {
                    vErrors.push(err44);
                  }
                  errors++;
                }
                if (func3(data12) < 1) {
                  const err45 = { instancePath: instancePath + "/operators/" + i1 + "/id", schemaPath: "#/$defs/RecognizedOperator/properties/id/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err45];
                  } else {
                    vErrors.push(err45);
                  }
                  errors++;
                }
              } else {
                const err46 = { instancePath: instancePath + "/operators/" + i1 + "/id", schemaPath: "#/$defs/RecognizedOperator/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err46];
                } else {
                  vErrors.push(err46);
                }
                errors++;
              }
            }
            if (data11.name !== void 0) {
              let data13 = data11.name;
              if (typeof data13 === "string") {
                if (func3(data13) > 300) {
                  const err47 = { instancePath: instancePath + "/operators/" + i1 + "/name", schemaPath: "#/$defs/RecognizedOperator/properties/name/maxLength", keyword: "maxLength", params: { limit: 300 }, message: "must NOT have more than 300 characters" };
                  if (vErrors === null) {
                    vErrors = [err47];
                  } else {
                    vErrors.push(err47);
                  }
                  errors++;
                }
                if (func3(data13) < 1) {
                  const err48 = { instancePath: instancePath + "/operators/" + i1 + "/name", schemaPath: "#/$defs/RecognizedOperator/properties/name/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err48];
                  } else {
                    vErrors.push(err48);
                  }
                  errors++;
                }
              } else {
                const err49 = { instancePath: instancePath + "/operators/" + i1 + "/name", schemaPath: "#/$defs/RecognizedOperator/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err49];
                } else {
                  vErrors.push(err49);
                }
                errors++;
              }
            }
            if (data11.own !== void 0) {
              if (typeof data11.own !== "boolean") {
                const err50 = { instancePath: instancePath + "/operators/" + i1 + "/own", schemaPath: "#/$defs/RecognizedOperator/properties/own/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                if (vErrors === null) {
                  vErrors = [err50];
                } else {
                  vErrors.push(err50);
                }
                errors++;
              }
            }
            if (data11.elite !== void 0) {
              let data15 = data11.elite;
              if (!(typeof data15 == "number" && (!(data15 % 1) && !isNaN(data15)) && isFinite(data15))) {
                const err51 = { instancePath: instancePath + "/operators/" + i1 + "/elite", schemaPath: "#/$defs/RecognizedOperator/properties/elite/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err51];
                } else {
                  vErrors.push(err51);
                }
                errors++;
              }
              if (typeof data15 == "number" && isFinite(data15)) {
                if (data15 > 2147483647 || isNaN(data15)) {
                  const err52 = { instancePath: instancePath + "/operators/" + i1 + "/elite", schemaPath: "#/$defs/RecognizedOperator/properties/elite/maximum", keyword: "maximum", params: { comparison: "<=", limit: 2147483647 }, message: "must be <= 2147483647" };
                  if (vErrors === null) {
                    vErrors = [err52];
                  } else {
                    vErrors.push(err52);
                  }
                  errors++;
                }
                if (data15 < -2147483648 || isNaN(data15)) {
                  const err53 = { instancePath: instancePath + "/operators/" + i1 + "/elite", schemaPath: "#/$defs/RecognizedOperator/properties/elite/minimum", keyword: "minimum", params: { comparison: ">=", limit: -2147483648 }, message: "must be >= -2147483648" };
                  if (vErrors === null) {
                    vErrors = [err53];
                  } else {
                    vErrors.push(err53);
                  }
                  errors++;
                }
              }
            }
            if (data11.level !== void 0) {
              let data16 = data11.level;
              if (!(typeof data16 == "number" && (!(data16 % 1) && !isNaN(data16)) && isFinite(data16))) {
                const err54 = { instancePath: instancePath + "/operators/" + i1 + "/level", schemaPath: "#/$defs/RecognizedOperator/properties/level/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err54];
                } else {
                  vErrors.push(err54);
                }
                errors++;
              }
              if (typeof data16 == "number" && isFinite(data16)) {
                if (data16 > 2147483647 || isNaN(data16)) {
                  const err55 = { instancePath: instancePath + "/operators/" + i1 + "/level", schemaPath: "#/$defs/RecognizedOperator/properties/level/maximum", keyword: "maximum", params: { comparison: "<=", limit: 2147483647 }, message: "must be <= 2147483647" };
                  if (vErrors === null) {
                    vErrors = [err55];
                  } else {
                    vErrors.push(err55);
                  }
                  errors++;
                }
                if (data16 < -2147483648 || isNaN(data16)) {
                  const err56 = { instancePath: instancePath + "/operators/" + i1 + "/level", schemaPath: "#/$defs/RecognizedOperator/properties/level/minimum", keyword: "minimum", params: { comparison: ">=", limit: -2147483648 }, message: "must be >= -2147483648" };
                  if (vErrors === null) {
                    vErrors = [err56];
                  } else {
                    vErrors.push(err56);
                  }
                  errors++;
                }
              }
            }
            if (data11.potential !== void 0) {
              let data17 = data11.potential;
              if (!(typeof data17 == "number" && (!(data17 % 1) && !isNaN(data17)) && isFinite(data17))) {
                const err57 = { instancePath: instancePath + "/operators/" + i1 + "/potential", schemaPath: "#/$defs/RecognizedOperator/properties/potential/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err57];
                } else {
                  vErrors.push(err57);
                }
                errors++;
              }
              if (typeof data17 == "number" && isFinite(data17)) {
                if (data17 > 2147483647 || isNaN(data17)) {
                  const err58 = { instancePath: instancePath + "/operators/" + i1 + "/potential", schemaPath: "#/$defs/RecognizedOperator/properties/potential/maximum", keyword: "maximum", params: { comparison: "<=", limit: 2147483647 }, message: "must be <= 2147483647" };
                  if (vErrors === null) {
                    vErrors = [err58];
                  } else {
                    vErrors.push(err58);
                  }
                  errors++;
                }
                if (data17 < -2147483648 || isNaN(data17)) {
                  const err59 = { instancePath: instancePath + "/operators/" + i1 + "/potential", schemaPath: "#/$defs/RecognizedOperator/properties/potential/minimum", keyword: "minimum", params: { comparison: ">=", limit: -2147483648 }, message: "must be >= -2147483648" };
                  if (vErrors === null) {
                    vErrors = [err59];
                  } else {
                    vErrors.push(err59);
                  }
                  errors++;
                }
              }
            }
            if (data11.rarity !== void 0) {
              let data18 = data11.rarity;
              if (!(typeof data18 == "number" && (!(data18 % 1) && !isNaN(data18)) && isFinite(data18))) {
                const err60 = { instancePath: instancePath + "/operators/" + i1 + "/rarity", schemaPath: "#/$defs/RecognizedOperator/properties/rarity/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err60];
                } else {
                  vErrors.push(err60);
                }
                errors++;
              }
              if (typeof data18 == "number" && isFinite(data18)) {
                if (data18 > 2147483647 || isNaN(data18)) {
                  const err61 = { instancePath: instancePath + "/operators/" + i1 + "/rarity", schemaPath: "#/$defs/RecognizedOperator/properties/rarity/maximum", keyword: "maximum", params: { comparison: "<=", limit: 2147483647 }, message: "must be <= 2147483647" };
                  if (vErrors === null) {
                    vErrors = [err61];
                  } else {
                    vErrors.push(err61);
                  }
                  errors++;
                }
                if (data18 < -2147483648 || isNaN(data18)) {
                  const err62 = { instancePath: instancePath + "/operators/" + i1 + "/rarity", schemaPath: "#/$defs/RecognizedOperator/properties/rarity/minimum", keyword: "minimum", params: { comparison: ">=", limit: -2147483648 }, message: "must be >= -2147483648" };
                  if (vErrors === null) {
                    vErrors = [err62];
                  } else {
                    vErrors.push(err62);
                  }
                  errors++;
                }
              }
            }
          } else {
            const err63 = { instancePath: instancePath + "/operators/" + i1, schemaPath: "#/$defs/RecognizedOperator/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err63];
            } else {
              vErrors.push(err63);
            }
            errors++;
          }
        }
      } else {
        const err64 = { instancePath: instancePath + "/operators", schemaPath: "#/properties/operators/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err64];
        } else {
          vErrors.push(err64);
        }
        errors++;
      }
    }
  } else {
    const err65 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err65];
    } else {
      vErrors.push(err65);
    }
    errors++;
  }
  validate77.errors = vErrors;
  return errors === 0;
}
var validateItemResourceParams = validate78;
function validate78(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.itemId === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "itemId" }, message: "must have required property 'itemId'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "itemId" || key0 === "clientType")) {
        const err1 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
    if (data.itemId !== void 0) {
      let data0 = data.itemId;
      if (typeof data0 === "string") {
        if (func3(data0) > 200) {
          const err2 = { instancePath: instancePath + "/itemId", schemaPath: "#/properties/itemId/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (func3(data0) < 1) {
          const err3 = { instancePath: instancePath + "/itemId", schemaPath: "#/properties/itemId/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (!pattern1.test(data0)) {
          const err4 = { instancePath: instancePath + "/itemId", schemaPath: "#/properties/itemId/pattern", keyword: "pattern", params: { pattern: "^[A-Za-z0-9_-]+$" }, message: 'must match pattern "^[A-Za-z0-9_-]+$"' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      } else {
        const err5 = { instancePath: instancePath + "/itemId", schemaPath: "#/properties/itemId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.clientType !== void 0) {
      let data1 = data.clientType;
      if (!(data1 === "Official" || data1 === "Bilibili" || data1 === "YoStarEN" || data1 === "YoStarJP" || data1 === "YoStarKR" || data1 === "txwy")) {
        const err6 = { instancePath: instancePath + "/clientType", schemaPath: "#/$defs/ClientType/enum", keyword: "enum", params: { allowedValues: schema53.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
  } else {
    const err7 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err7];
    } else {
      vErrors.push(err7);
    }
    errors++;
  }
  validate78.errors = vErrors;
  return errors === 0;
}
var validateItemResourceResult = validate79;
var schema85 = { "type": "object", "additionalProperties": false, "required": ["itemId", "name", "mimeType", "data", "resourceVersion"], "properties": { "itemId": { "type": "string", "minLength": 1, "maxLength": 200 }, "name": { "type": ["string", "null"], "maxLength": 300 }, "mimeType": { "enum": ["image/png", null] }, "data": { "type": ["string", "null"], "maxLength": 1398104 }, "resourceVersion": { "type": ["string", "null"], "maxLength": 200 } } };
function validate79(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.itemId === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "itemId" }, message: "must have required property 'itemId'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.name === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.mimeType === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "mimeType" }, message: "must have required property 'mimeType'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.data === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "data" }, message: "must have required property 'data'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.resourceVersion === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "resourceVersion" }, message: "must have required property 'resourceVersion'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "itemId" || key0 === "name" || key0 === "mimeType" || key0 === "data" || key0 === "resourceVersion")) {
        const err5 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.itemId !== void 0) {
      let data0 = data.itemId;
      if (typeof data0 === "string") {
        if (func3(data0) > 200) {
          const err6 = { instancePath: instancePath + "/itemId", schemaPath: "#/properties/itemId/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (func3(data0) < 1) {
          const err7 = { instancePath: instancePath + "/itemId", schemaPath: "#/properties/itemId/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
      } else {
        const err8 = { instancePath: instancePath + "/itemId", schemaPath: "#/properties/itemId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.name !== void 0) {
      let data1 = data.name;
      if (typeof data1 !== "string" && data1 !== null) {
        const err9 = { instancePath: instancePath + "/name", schemaPath: "#/properties/name/type", keyword: "type", params: { type: schema85.properties.name.type }, message: "must be string,null" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
      if (typeof data1 === "string") {
        if (func3(data1) > 300) {
          const err10 = { instancePath: instancePath + "/name", schemaPath: "#/properties/name/maxLength", keyword: "maxLength", params: { limit: 300 }, message: "must NOT have more than 300 characters" };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      }
    }
    if (data.mimeType !== void 0) {
      let data2 = data.mimeType;
      if (!(data2 === "image/png" || data2 === null)) {
        const err11 = { instancePath: instancePath + "/mimeType", schemaPath: "#/properties/mimeType/enum", keyword: "enum", params: { allowedValues: schema85.properties.mimeType.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.data !== void 0) {
      let data3 = data.data;
      if (typeof data3 !== "string" && data3 !== null) {
        const err12 = { instancePath: instancePath + "/data", schemaPath: "#/properties/data/type", keyword: "type", params: { type: schema85.properties.data.type }, message: "must be string,null" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
      if (typeof data3 === "string") {
        if (func3(data3) > 1398104) {
          const err13 = { instancePath: instancePath + "/data", schemaPath: "#/properties/data/maxLength", keyword: "maxLength", params: { limit: 1398104 }, message: "must NOT have more than 1398104 characters" };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
      }
    }
    if (data.resourceVersion !== void 0) {
      let data4 = data.resourceVersion;
      if (typeof data4 !== "string" && data4 !== null) {
        const err14 = { instancePath: instancePath + "/resourceVersion", schemaPath: "#/properties/resourceVersion/type", keyword: "type", params: { type: schema85.properties.resourceVersion.type }, message: "must be string,null" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
      if (typeof data4 === "string") {
        if (func3(data4) > 200) {
          const err15 = { instancePath: instancePath + "/resourceVersion", schemaPath: "#/properties/resourceVersion/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
      }
    }
  } else {
    const err16 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err16];
    } else {
      vErrors.push(err16);
    }
    errors++;
  }
  validate79.errors = vErrors;
  return errors === 0;
}
var validateOperatorResourceParams = validate80;
var pattern3 = new RegExp("^[^\\u0000-\\u001f\\u007f]+$", "u");
function validate80(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.name === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "name" || key0 === "clientType")) {
        const err1 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err1];
        } else {
          vErrors.push(err1);
        }
        errors++;
      }
    }
    if (data.name !== void 0) {
      let data0 = data.name;
      if (typeof data0 === "string") {
        if (func3(data0) > 300) {
          const err2 = { instancePath: instancePath + "/name", schemaPath: "#/properties/name/maxLength", keyword: "maxLength", params: { limit: 300 }, message: "must NOT have more than 300 characters" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (func3(data0) < 1) {
          const err3 = { instancePath: instancePath + "/name", schemaPath: "#/properties/name/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (!pattern3.test(data0)) {
          const err4 = { instancePath: instancePath + "/name", schemaPath: "#/properties/name/pattern", keyword: "pattern", params: { pattern: "^[^\\u0000-\\u001f\\u007f]+$" }, message: 'must match pattern "^[^\\u0000-\\u001f\\u007f]+$"' };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      } else {
        const err5 = { instancePath: instancePath + "/name", schemaPath: "#/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.clientType !== void 0) {
      let data1 = data.clientType;
      if (!(data1 === "Official" || data1 === "Bilibili" || data1 === "YoStarEN" || data1 === "YoStarJP" || data1 === "YoStarKR" || data1 === "txwy")) {
        const err6 = { instancePath: instancePath + "/clientType", schemaPath: "#/$defs/ClientType/enum", keyword: "enum", params: { allowedValues: schema53.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
  } else {
    const err7 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err7];
    } else {
      vErrors.push(err7);
    }
    errors++;
  }
  validate80.errors = vErrors;
  return errors === 0;
}
var validateOperatorResourceResult = validate81;
var schema86 = { "description": "Bounded artwork and metadata from the active installed MaaResource; missing or ambiguous names keep text and known rarity without guessing an avatar.", "type": "object", "additionalProperties": false, "required": ["name", "id", "rarity", "mimeType", "data", "resourceVersion"], "properties": { "name": { "type": "string", "minLength": 1, "maxLength": 300 }, "id": { "type": ["string", "null"], "maxLength": 200 }, "rarity": { "description": "1-based star count; null means unknown or conflicting candidates.", "type": ["integer", "null"], "minimum": 1, "maximum": 6 }, "mimeType": { "enum": ["image/png", null] }, "data": { "type": ["string", "null"], "maxLength": 699052 }, "resourceVersion": { "type": ["string", "null"], "maxLength": 200 } } };
function validate81(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.name === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.id === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.rarity === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "rarity" }, message: "must have required property 'rarity'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.mimeType === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "mimeType" }, message: "must have required property 'mimeType'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.data === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "data" }, message: "must have required property 'data'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.resourceVersion === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "resourceVersion" }, message: "must have required property 'resourceVersion'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "name" || key0 === "id" || key0 === "rarity" || key0 === "mimeType" || key0 === "data" || key0 === "resourceVersion")) {
        const err6 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.name !== void 0) {
      let data0 = data.name;
      if (typeof data0 === "string") {
        if (func3(data0) > 300) {
          const err7 = { instancePath: instancePath + "/name", schemaPath: "#/properties/name/maxLength", keyword: "maxLength", params: { limit: 300 }, message: "must NOT have more than 300 characters" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (func3(data0) < 1) {
          const err8 = { instancePath: instancePath + "/name", schemaPath: "#/properties/name/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      } else {
        const err9 = { instancePath: instancePath + "/name", schemaPath: "#/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.id !== void 0) {
      let data1 = data.id;
      if (typeof data1 !== "string" && data1 !== null) {
        const err10 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/type", keyword: "type", params: { type: schema86.properties.id.type }, message: "must be string,null" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
      if (typeof data1 === "string") {
        if (func3(data1) > 200) {
          const err11 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      }
    }
    if (data.rarity !== void 0) {
      let data2 = data.rarity;
      if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2)) && data2 !== null) {
        const err12 = { instancePath: instancePath + "/rarity", schemaPath: "#/properties/rarity/type", keyword: "type", params: { type: schema86.properties.rarity.type }, message: "must be integer,null" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
      if (typeof data2 == "number" && isFinite(data2)) {
        if (data2 > 6 || isNaN(data2)) {
          const err13 = { instancePath: instancePath + "/rarity", schemaPath: "#/properties/rarity/maximum", keyword: "maximum", params: { comparison: "<=", limit: 6 }, message: "must be <= 6" };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
        if (data2 < 1 || isNaN(data2)) {
          const err14 = { instancePath: instancePath + "/rarity", schemaPath: "#/properties/rarity/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
      }
    }
    if (data.mimeType !== void 0) {
      let data3 = data.mimeType;
      if (!(data3 === "image/png" || data3 === null)) {
        const err15 = { instancePath: instancePath + "/mimeType", schemaPath: "#/properties/mimeType/enum", keyword: "enum", params: { allowedValues: schema86.properties.mimeType.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.data !== void 0) {
      let data4 = data.data;
      if (typeof data4 !== "string" && data4 !== null) {
        const err16 = { instancePath: instancePath + "/data", schemaPath: "#/properties/data/type", keyword: "type", params: { type: schema86.properties.data.type }, message: "must be string,null" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
      if (typeof data4 === "string") {
        if (func3(data4) > 699052) {
          const err17 = { instancePath: instancePath + "/data", schemaPath: "#/properties/data/maxLength", keyword: "maxLength", params: { limit: 699052 }, message: "must NOT have more than 699052 characters" };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
      }
    }
    if (data.resourceVersion !== void 0) {
      let data5 = data.resourceVersion;
      if (typeof data5 !== "string" && data5 !== null) {
        const err18 = { instancePath: instancePath + "/resourceVersion", schemaPath: "#/properties/resourceVersion/type", keyword: "type", params: { type: schema86.properties.resourceVersion.type }, message: "must be string,null" };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
      if (typeof data5 === "string") {
        if (func3(data5) > 200) {
          const err19 = { instancePath: instancePath + "/resourceVersion", schemaPath: "#/properties/resourceVersion/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
      }
    }
  } else {
    const err20 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err20];
    } else {
      vErrors.push(err20);
    }
    errors++;
  }
  validate81.errors = vErrors;
  return errors === 0;
}
var validateScreenFrame = validate82;
var schema91 = { "description": "Transient MaaCore preview PNG. Its width/height are the click coordinate space; image bytes never enter snapshots or persistence.", "type": "object", "additionalProperties": false, "required": ["deviceId", "frameId", "capturedAt", "width", "height", "mimeType", "data", "canControl", "latencyMs"], "properties": { "deviceId": { "type": "string", "minLength": 1, "maxLength": 200 }, "frameId": { "type": "string", "minLength": 1, "maxLength": 200 }, "capturedAt": { "type": "string", "minLength": 1, "maxLength": 40 }, "width": { "type": "integer", "minimum": 1, "maximum": 8192 }, "height": { "type": "integer", "minimum": 1, "maximum": 8192 }, "mimeType": { "const": "image/png" }, "data": { "type": "string", "minLength": 1, "maxLength": 4183384 }, "canControl": { "type": "boolean" }, "latencyMs": { "type": "number", "minimum": 0 } } };
function validate82(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.deviceId === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "deviceId" }, message: "must have required property 'deviceId'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.frameId === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "frameId" }, message: "must have required property 'frameId'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.capturedAt === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "capturedAt" }, message: "must have required property 'capturedAt'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.width === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "width" }, message: "must have required property 'width'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.height === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "height" }, message: "must have required property 'height'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.mimeType === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "mimeType" }, message: "must have required property 'mimeType'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.data === void 0) {
      const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "data" }, message: "must have required property 'data'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.canControl === void 0) {
      const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "canControl" }, message: "must have required property 'canControl'" };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.latencyMs === void 0) {
      const err8 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "latencyMs" }, message: "must have required property 'latencyMs'" };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func2.call(schema91.properties, key0)) {
        const err9 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.deviceId !== void 0) {
      let data0 = data.deviceId;
      if (typeof data0 === "string") {
        if (func3(data0) > 200) {
          const err10 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
        if (func3(data0) < 1) {
          const err11 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      } else {
        const err12 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.frameId !== void 0) {
      let data1 = data.frameId;
      if (typeof data1 === "string") {
        if (func3(data1) > 200) {
          const err13 = { instancePath: instancePath + "/frameId", schemaPath: "#/properties/frameId/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
        if (func3(data1) < 1) {
          const err14 = { instancePath: instancePath + "/frameId", schemaPath: "#/properties/frameId/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
      } else {
        const err15 = { instancePath: instancePath + "/frameId", schemaPath: "#/properties/frameId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.capturedAt !== void 0) {
      let data2 = data.capturedAt;
      if (typeof data2 === "string") {
        if (func3(data2) > 40) {
          const err16 = { instancePath: instancePath + "/capturedAt", schemaPath: "#/properties/capturedAt/maxLength", keyword: "maxLength", params: { limit: 40 }, message: "must NOT have more than 40 characters" };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
        if (func3(data2) < 1) {
          const err17 = { instancePath: instancePath + "/capturedAt", schemaPath: "#/properties/capturedAt/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
      } else {
        const err18 = { instancePath: instancePath + "/capturedAt", schemaPath: "#/properties/capturedAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
    }
    if (data.width !== void 0) {
      let data3 = data.width;
      if (!(typeof data3 == "number" && (!(data3 % 1) && !isNaN(data3)) && isFinite(data3))) {
        const err19 = { instancePath: instancePath + "/width", schemaPath: "#/properties/width/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
      if (typeof data3 == "number" && isFinite(data3)) {
        if (data3 > 8192 || isNaN(data3)) {
          const err20 = { instancePath: instancePath + "/width", schemaPath: "#/properties/width/maximum", keyword: "maximum", params: { comparison: "<=", limit: 8192 }, message: "must be <= 8192" };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
        if (data3 < 1 || isNaN(data3)) {
          const err21 = { instancePath: instancePath + "/width", schemaPath: "#/properties/width/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      }
    }
    if (data.height !== void 0) {
      let data4 = data.height;
      if (!(typeof data4 == "number" && (!(data4 % 1) && !isNaN(data4)) && isFinite(data4))) {
        const err22 = { instancePath: instancePath + "/height", schemaPath: "#/properties/height/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
      if (typeof data4 == "number" && isFinite(data4)) {
        if (data4 > 8192 || isNaN(data4)) {
          const err23 = { instancePath: instancePath + "/height", schemaPath: "#/properties/height/maximum", keyword: "maximum", params: { comparison: "<=", limit: 8192 }, message: "must be <= 8192" };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
        if (data4 < 1 || isNaN(data4)) {
          const err24 = { instancePath: instancePath + "/height", schemaPath: "#/properties/height/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
      }
    }
    if (data.mimeType !== void 0) {
      if ("image/png" !== data.mimeType) {
        const err25 = { instancePath: instancePath + "/mimeType", schemaPath: "#/properties/mimeType/const", keyword: "const", params: { allowedValue: "image/png" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
    }
    if (data.data !== void 0) {
      let data6 = data.data;
      if (typeof data6 === "string") {
        if (func3(data6) > 4183384) {
          const err26 = { instancePath: instancePath + "/data", schemaPath: "#/properties/data/maxLength", keyword: "maxLength", params: { limit: 4183384 }, message: "must NOT have more than 4183384 characters" };
          if (vErrors === null) {
            vErrors = [err26];
          } else {
            vErrors.push(err26);
          }
          errors++;
        }
        if (func3(data6) < 1) {
          const err27 = { instancePath: instancePath + "/data", schemaPath: "#/properties/data/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err27];
          } else {
            vErrors.push(err27);
          }
          errors++;
        }
      } else {
        const err28 = { instancePath: instancePath + "/data", schemaPath: "#/properties/data/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err28];
        } else {
          vErrors.push(err28);
        }
        errors++;
      }
    }
    if (data.canControl !== void 0) {
      if (typeof data.canControl !== "boolean") {
        const err29 = { instancePath: instancePath + "/canControl", schemaPath: "#/properties/canControl/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err29];
        } else {
          vErrors.push(err29);
        }
        errors++;
      }
    }
    if (data.latencyMs !== void 0) {
      let data8 = data.latencyMs;
      if (typeof data8 == "number" && isFinite(data8)) {
        if (data8 < 0 || isNaN(data8)) {
          const err30 = { instancePath: instancePath + "/latencyMs", schemaPath: "#/properties/latencyMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err30];
          } else {
            vErrors.push(err30);
          }
          errors++;
        }
      } else {
        const err31 = { instancePath: instancePath + "/latencyMs", schemaPath: "#/properties/latencyMs/type", keyword: "type", params: { type: "number" }, message: "must be number" };
        if (vErrors === null) {
          vErrors = [err31];
        } else {
          vErrors.push(err31);
        }
        errors++;
      }
    }
  } else {
    const err32 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err32];
    } else {
      vErrors.push(err32);
    }
    errors++;
  }
  validate82.errors = vErrors;
  return errors === 0;
}
var validateWorkerFrame = validate86;
function validate86(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.width === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "width" }, message: "must have required property 'width'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.height === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "height" }, message: "must have required property 'height'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.mimeType === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "mimeType" }, message: "must have required property 'mimeType'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.data === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "data" }, message: "must have required property 'data'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.canControl === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "canControl" }, message: "must have required property 'canControl'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "width" || key0 === "height" || key0 === "mimeType" || key0 === "data" || key0 === "canControl")) {
        const err5 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.width !== void 0) {
      let data0 = data.width;
      if (!(typeof data0 == "number" && (!(data0 % 1) && !isNaN(data0)) && isFinite(data0))) {
        const err6 = { instancePath: instancePath + "/width", schemaPath: "#/properties/width/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
      if (typeof data0 == "number" && isFinite(data0)) {
        if (data0 > 8192 || isNaN(data0)) {
          const err7 = { instancePath: instancePath + "/width", schemaPath: "#/properties/width/maximum", keyword: "maximum", params: { comparison: "<=", limit: 8192 }, message: "must be <= 8192" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (data0 < 1 || isNaN(data0)) {
          const err8 = { instancePath: instancePath + "/width", schemaPath: "#/properties/width/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
    }
    if (data.height !== void 0) {
      let data1 = data.height;
      if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
        const err9 = { instancePath: instancePath + "/height", schemaPath: "#/properties/height/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
      if (typeof data1 == "number" && isFinite(data1)) {
        if (data1 > 8192 || isNaN(data1)) {
          const err10 = { instancePath: instancePath + "/height", schemaPath: "#/properties/height/maximum", keyword: "maximum", params: { comparison: "<=", limit: 8192 }, message: "must be <= 8192" };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
        if (data1 < 1 || isNaN(data1)) {
          const err11 = { instancePath: instancePath + "/height", schemaPath: "#/properties/height/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      }
    }
    if (data.mimeType !== void 0) {
      if ("image/png" !== data.mimeType) {
        const err12 = { instancePath: instancePath + "/mimeType", schemaPath: "#/properties/mimeType/const", keyword: "const", params: { allowedValue: "image/png" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.data !== void 0) {
      let data3 = data.data;
      if (typeof data3 === "string") {
        if (func3(data3) > 4183384) {
          const err13 = { instancePath: instancePath + "/data", schemaPath: "#/properties/data/maxLength", keyword: "maxLength", params: { limit: 4183384 }, message: "must NOT have more than 4183384 characters" };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
        if (func3(data3) < 1) {
          const err14 = { instancePath: instancePath + "/data", schemaPath: "#/properties/data/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
      } else {
        const err15 = { instancePath: instancePath + "/data", schemaPath: "#/properties/data/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.canControl !== void 0) {
      if (typeof data.canControl !== "boolean") {
        const err16 = { instancePath: instancePath + "/canControl", schemaPath: "#/properties/canControl/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
  } else {
    const err17 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err17];
    } else {
      vErrors.push(err17);
    }
    errors++;
  }
  validate86.errors = vErrors;
  return errors === 0;
}
var validateWorkerConfiguration = validate87;
var schema122 = { "type": "object", "additionalProperties": false, "required": ["protocolVersion", "core", "resource", "adb", "address", "userDir", "lockPath"], "properties": { "protocolVersion": { "const": 1 }, "core": { "type": "string", "minLength": 1 }, "resource": { "type": "string", "minLength": 1 }, "adb": { "type": "string", "minLength": 1 }, "address": { "type": "string", "minLength": 1 }, "userDir": { "type": "string", "minLength": 1 }, "lockPath": { "type": "string", "minLength": 1 }, "capture": { "$ref": "#/$defs/WorkerCaptureConfiguration" }, "connection": { "$ref": "#/$defs/WorkerConnectionConfiguration" }, "lockTimeoutMs": { "type": "integer", "minimum": 0, "maximum": 6e4 }, "startupTimeoutMs": { "type": "integer", "minimum": 1, "maximum": 12e4 }, "nativeCallTimeoutMs": { "type": "integer", "minimum": 1, "maximum": 12e4 }, "asyncTimeoutMs": { "type": "integer", "minimum": 1, "maximum": 12e4 }, "shutdownTimeoutMs": { "type": "integer", "minimum": 1, "maximum": 12e4 } } };
var schema124 = { "type": "object", "additionalProperties": false, "required": ["config", "touchMode", "adbLite", "clientType"], "properties": { "config": { "enum": ["General", "BlueStacks", "MuMuEmulator12", "MuMuArm", "LDPlayer", "Nox", "XYAZ", "Compatible", "SecondResolution", "CompatMac", "CompatPOSIXShell", "Waydroid", "AVD", "Androws", "WSA"] }, "touchMode": { "enum": ["minitouch", "maatouch", "adb", "MaaFwAdb"] }, "adbLite": { "type": "boolean" }, "clientType": { "enum": ["Official", "Bilibili", "YoStarEN", "YoStarJP", "YoStarKR", "txwy"] } } };
function validate87(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.protocolVersion === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "protocolVersion" }, message: "must have required property 'protocolVersion'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.core === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "core" }, message: "must have required property 'core'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.resource === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "resource" }, message: "must have required property 'resource'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.adb === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "adb" }, message: "must have required property 'adb'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.address === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "address" }, message: "must have required property 'address'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.userDir === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "userDir" }, message: "must have required property 'userDir'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.lockPath === void 0) {
      const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "lockPath" }, message: "must have required property 'lockPath'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func2.call(schema122.properties, key0)) {
        const err7 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.protocolVersion !== void 0) {
      if (1 !== data.protocolVersion) {
        const err8 = { instancePath: instancePath + "/protocolVersion", schemaPath: "#/properties/protocolVersion/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.core !== void 0) {
      let data1 = data.core;
      if (typeof data1 === "string") {
        if (func3(data1) < 1) {
          const err9 = { instancePath: instancePath + "/core", schemaPath: "#/properties/core/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
      } else {
        const err10 = { instancePath: instancePath + "/core", schemaPath: "#/properties/core/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.resource !== void 0) {
      let data2 = data.resource;
      if (typeof data2 === "string") {
        if (func3(data2) < 1) {
          const err11 = { instancePath: instancePath + "/resource", schemaPath: "#/properties/resource/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
      } else {
        const err12 = { instancePath: instancePath + "/resource", schemaPath: "#/properties/resource/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.adb !== void 0) {
      let data3 = data.adb;
      if (typeof data3 === "string") {
        if (func3(data3) < 1) {
          const err13 = { instancePath: instancePath + "/adb", schemaPath: "#/properties/adb/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
      } else {
        const err14 = { instancePath: instancePath + "/adb", schemaPath: "#/properties/adb/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    if (data.address !== void 0) {
      let data4 = data.address;
      if (typeof data4 === "string") {
        if (func3(data4) < 1) {
          const err15 = { instancePath: instancePath + "/address", schemaPath: "#/properties/address/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
      } else {
        const err16 = { instancePath: instancePath + "/address", schemaPath: "#/properties/address/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
    if (data.userDir !== void 0) {
      let data5 = data.userDir;
      if (typeof data5 === "string") {
        if (func3(data5) < 1) {
          const err17 = { instancePath: instancePath + "/userDir", schemaPath: "#/properties/userDir/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
      } else {
        const err18 = { instancePath: instancePath + "/userDir", schemaPath: "#/properties/userDir/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
    }
    if (data.lockPath !== void 0) {
      let data6 = data.lockPath;
      if (typeof data6 === "string") {
        if (func3(data6) < 1) {
          const err19 = { instancePath: instancePath + "/lockPath", schemaPath: "#/properties/lockPath/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
      } else {
        const err20 = { instancePath: instancePath + "/lockPath", schemaPath: "#/properties/lockPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
    }
    if (data.capture !== void 0) {
      let data7 = data.capture;
      const _errs17 = errors;
      let valid2 = false;
      let passing0 = null;
      const _errs18 = errors;
      if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
        if (data7.method === void 0) {
          const err21 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/0/required", keyword: "required", params: { missingProperty: "method" }, message: "must have required property 'method'" };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
        for (const key1 in data7) {
          if (!(key1 === "method")) {
            const err22 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
        }
        if (data7.method !== void 0) {
          if ("adb" !== data7.method) {
            const err23 = { instancePath: instancePath + "/capture/method", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/0/properties/method/const", keyword: "const", params: { allowedValue: "adb" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
        }
      } else {
        const err24 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
      var _valid0 = _errs18 === errors;
      if (_valid0) {
        valid2 = true;
        passing0 = 0;
      }
      const _errs22 = errors;
      if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
        if (data7.method === void 0) {
          const err25 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/1/required", keyword: "required", params: { missingProperty: "method" }, message: "must have required property 'method'" };
          if (vErrors === null) {
            vErrors = [err25];
          } else {
            vErrors.push(err25);
          }
          errors++;
        }
        if (data7.emulatorPath === void 0) {
          const err26 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/1/required", keyword: "required", params: { missingProperty: "emulatorPath" }, message: "must have required property 'emulatorPath'" };
          if (vErrors === null) {
            vErrors = [err26];
          } else {
            vErrors.push(err26);
          }
          errors++;
        }
        if (data7.instanceIndex === void 0) {
          const err27 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/1/required", keyword: "required", params: { missingProperty: "instanceIndex" }, message: "must have required property 'instanceIndex'" };
          if (vErrors === null) {
            vErrors = [err27];
          } else {
            vErrors.push(err27);
          }
          errors++;
        }
        for (const key2 in data7) {
          if (!(key2 === "method" || key2 === "emulatorPath" || key2 === "instanceIndex" || key2 === "mumuTouch" || key2 === "mumuBridge")) {
            const err28 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err28];
            } else {
              vErrors.push(err28);
            }
            errors++;
          }
        }
        if (data7.method !== void 0) {
          if ("mumu" !== data7.method) {
            const err29 = { instancePath: instancePath + "/capture/method", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/1/properties/method/const", keyword: "const", params: { allowedValue: "mumu" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err29];
            } else {
              vErrors.push(err29);
            }
            errors++;
          }
        }
        if (data7.emulatorPath !== void 0) {
          let data10 = data7.emulatorPath;
          if (typeof data10 === "string") {
            if (func3(data10) < 1) {
              const err30 = { instancePath: instancePath + "/capture/emulatorPath", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/1/properties/emulatorPath/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
              if (vErrors === null) {
                vErrors = [err30];
              } else {
                vErrors.push(err30);
              }
              errors++;
            }
          } else {
            const err31 = { instancePath: instancePath + "/capture/emulatorPath", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/1/properties/emulatorPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err31];
            } else {
              vErrors.push(err31);
            }
            errors++;
          }
        }
        if (data7.instanceIndex !== void 0) {
          let data11 = data7.instanceIndex;
          if (!(typeof data11 == "number" && (!(data11 % 1) && !isNaN(data11)) && isFinite(data11))) {
            const err32 = { instancePath: instancePath + "/capture/instanceIndex", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/1/properties/instanceIndex/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err32];
            } else {
              vErrors.push(err32);
            }
            errors++;
          }
          if (typeof data11 == "number" && isFinite(data11)) {
            if (data11 > 2147483647 || isNaN(data11)) {
              const err33 = { instancePath: instancePath + "/capture/instanceIndex", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/1/properties/instanceIndex/maximum", keyword: "maximum", params: { comparison: "<=", limit: 2147483647 }, message: "must be <= 2147483647" };
              if (vErrors === null) {
                vErrors = [err33];
              } else {
                vErrors.push(err33);
              }
              errors++;
            }
            if (data11 < 0 || isNaN(data11)) {
              const err34 = { instancePath: instancePath + "/capture/instanceIndex", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/1/properties/instanceIndex/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err34];
              } else {
                vErrors.push(err34);
              }
              errors++;
            }
          }
        }
        if (data7.mumuTouch !== void 0) {
          if (typeof data7.mumuTouch !== "boolean") {
            const err35 = { instancePath: instancePath + "/capture/mumuTouch", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/1/properties/mumuTouch/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err35];
            } else {
              vErrors.push(err35);
            }
            errors++;
          }
        }
        if (data7.mumuBridge !== void 0) {
          if (typeof data7.mumuBridge !== "boolean") {
            const err36 = { instancePath: instancePath + "/capture/mumuBridge", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/1/properties/mumuBridge/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err36];
            } else {
              vErrors.push(err36);
            }
            errors++;
          }
        }
      } else {
        const err37 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err37];
        } else {
          vErrors.push(err37);
        }
        errors++;
      }
      var _valid0 = _errs22 === errors;
      if (_valid0 && valid2) {
        valid2 = false;
        passing0 = [passing0, 1];
      } else {
        if (_valid0) {
          valid2 = true;
          passing0 = 1;
        }
        const _errs34 = errors;
        if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
          if (data7.method === void 0) {
            const err38 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/2/required", keyword: "required", params: { missingProperty: "method" }, message: "must have required property 'method'" };
            if (vErrors === null) {
              vErrors = [err38];
            } else {
              vErrors.push(err38);
            }
            errors++;
          }
          if (data7.emulatorPath === void 0) {
            const err39 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/2/required", keyword: "required", params: { missingProperty: "emulatorPath" }, message: "must have required property 'emulatorPath'" };
            if (vErrors === null) {
              vErrors = [err39];
            } else {
              vErrors.push(err39);
            }
            errors++;
          }
          if (data7.instanceIndex === void 0) {
            const err40 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/2/required", keyword: "required", params: { missingProperty: "instanceIndex" }, message: "must have required property 'instanceIndex'" };
            if (vErrors === null) {
              vErrors = [err40];
            } else {
              vErrors.push(err40);
            }
            errors++;
          }
          for (const key3 in data7) {
            if (!(key3 === "method" || key3 === "emulatorPath" || key3 === "instanceIndex" || key3 === "pid")) {
              const err41 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err41];
              } else {
                vErrors.push(err41);
              }
              errors++;
            }
          }
          if (data7.method !== void 0) {
            if ("ldplayer" !== data7.method) {
              const err42 = { instancePath: instancePath + "/capture/method", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/2/properties/method/const", keyword: "const", params: { allowedValue: "ldplayer" }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err42];
              } else {
                vErrors.push(err42);
              }
              errors++;
            }
          }
          if (data7.emulatorPath !== void 0) {
            let data15 = data7.emulatorPath;
            if (typeof data15 === "string") {
              if (func3(data15) < 1) {
                const err43 = { instancePath: instancePath + "/capture/emulatorPath", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/2/properties/emulatorPath/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                if (vErrors === null) {
                  vErrors = [err43];
                } else {
                  vErrors.push(err43);
                }
                errors++;
              }
            } else {
              const err44 = { instancePath: instancePath + "/capture/emulatorPath", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/2/properties/emulatorPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err44];
              } else {
                vErrors.push(err44);
              }
              errors++;
            }
          }
          if (data7.instanceIndex !== void 0) {
            let data16 = data7.instanceIndex;
            if (!(typeof data16 == "number" && (!(data16 % 1) && !isNaN(data16)) && isFinite(data16))) {
              const err45 = { instancePath: instancePath + "/capture/instanceIndex", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/2/properties/instanceIndex/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
              if (vErrors === null) {
                vErrors = [err45];
              } else {
                vErrors.push(err45);
              }
              errors++;
            }
            if (typeof data16 == "number" && isFinite(data16)) {
              if (data16 > 2147483647 || isNaN(data16)) {
                const err46 = { instancePath: instancePath + "/capture/instanceIndex", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/2/properties/instanceIndex/maximum", keyword: "maximum", params: { comparison: "<=", limit: 2147483647 }, message: "must be <= 2147483647" };
                if (vErrors === null) {
                  vErrors = [err46];
                } else {
                  vErrors.push(err46);
                }
                errors++;
              }
              if (data16 < 0 || isNaN(data16)) {
                const err47 = { instancePath: instancePath + "/capture/instanceIndex", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/2/properties/instanceIndex/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                if (vErrors === null) {
                  vErrors = [err47];
                } else {
                  vErrors.push(err47);
                }
                errors++;
              }
            }
          }
          if (data7.pid !== void 0) {
            let data17 = data7.pid;
            if (!(typeof data17 == "number" && (!(data17 % 1) && !isNaN(data17)) && isFinite(data17))) {
              const err48 = { instancePath: instancePath + "/capture/pid", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/2/properties/pid/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
              if (vErrors === null) {
                vErrors = [err48];
              } else {
                vErrors.push(err48);
              }
              errors++;
            }
            if (typeof data17 == "number" && isFinite(data17)) {
              if (data17 > 2147483647 || isNaN(data17)) {
                const err49 = { instancePath: instancePath + "/capture/pid", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/2/properties/pid/maximum", keyword: "maximum", params: { comparison: "<=", limit: 2147483647 }, message: "must be <= 2147483647" };
                if (vErrors === null) {
                  vErrors = [err49];
                } else {
                  vErrors.push(err49);
                }
                errors++;
              }
              if (data17 < 1 || isNaN(data17)) {
                const err50 = { instancePath: instancePath + "/capture/pid", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/2/properties/pid/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                if (vErrors === null) {
                  vErrors = [err50];
                } else {
                  vErrors.push(err50);
                }
                errors++;
              }
            }
          }
        } else {
          const err51 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err51];
          } else {
            vErrors.push(err51);
          }
          errors++;
        }
        var _valid0 = _errs34 === errors;
        if (_valid0 && valid2) {
          valid2 = false;
          passing0 = [passing0, 2];
        } else {
          if (_valid0) {
            valid2 = true;
            passing0 = 2;
          }
        }
      }
      if (!valid2) {
        const err52 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 }, message: "must match exactly one schema in oneOf" };
        if (vErrors === null) {
          vErrors = [err52];
        } else {
          vErrors.push(err52);
        }
        errors++;
      } else {
        errors = _errs17;
        if (vErrors !== null) {
          if (_errs17) {
            vErrors.length = _errs17;
          } else {
            vErrors = null;
          }
        }
      }
    }
    if (data.connection !== void 0) {
      let data18 = data.connection;
      if (data18 && typeof data18 == "object" && !Array.isArray(data18)) {
        if (data18.config === void 0) {
          const err53 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/WorkerConnectionConfiguration/required", keyword: "required", params: { missingProperty: "config" }, message: "must have required property 'config'" };
          if (vErrors === null) {
            vErrors = [err53];
          } else {
            vErrors.push(err53);
          }
          errors++;
        }
        if (data18.touchMode === void 0) {
          const err54 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/WorkerConnectionConfiguration/required", keyword: "required", params: { missingProperty: "touchMode" }, message: "must have required property 'touchMode'" };
          if (vErrors === null) {
            vErrors = [err54];
          } else {
            vErrors.push(err54);
          }
          errors++;
        }
        if (data18.adbLite === void 0) {
          const err55 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/WorkerConnectionConfiguration/required", keyword: "required", params: { missingProperty: "adbLite" }, message: "must have required property 'adbLite'" };
          if (vErrors === null) {
            vErrors = [err55];
          } else {
            vErrors.push(err55);
          }
          errors++;
        }
        if (data18.clientType === void 0) {
          const err56 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/WorkerConnectionConfiguration/required", keyword: "required", params: { missingProperty: "clientType" }, message: "must have required property 'clientType'" };
          if (vErrors === null) {
            vErrors = [err56];
          } else {
            vErrors.push(err56);
          }
          errors++;
        }
        for (const key4 in data18) {
          if (!(key4 === "config" || key4 === "touchMode" || key4 === "adbLite" || key4 === "clientType")) {
            const err57 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/WorkerConnectionConfiguration/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err57];
            } else {
              vErrors.push(err57);
            }
            errors++;
          }
        }
        if (data18.config !== void 0) {
          let data19 = data18.config;
          if (!(data19 === "General" || data19 === "BlueStacks" || data19 === "MuMuEmulator12" || data19 === "MuMuArm" || data19 === "LDPlayer" || data19 === "Nox" || data19 === "XYAZ" || data19 === "Compatible" || data19 === "SecondResolution" || data19 === "CompatMac" || data19 === "CompatPOSIXShell" || data19 === "Waydroid" || data19 === "AVD" || data19 === "Androws" || data19 === "WSA")) {
            const err58 = { instancePath: instancePath + "/connection/config", schemaPath: "#/$defs/WorkerConnectionConfiguration/properties/config/enum", keyword: "enum", params: { allowedValues: schema124.properties.config.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err58];
            } else {
              vErrors.push(err58);
            }
            errors++;
          }
        }
        if (data18.touchMode !== void 0) {
          let data20 = data18.touchMode;
          if (!(data20 === "minitouch" || data20 === "maatouch" || data20 === "adb" || data20 === "MaaFwAdb")) {
            const err59 = { instancePath: instancePath + "/connection/touchMode", schemaPath: "#/$defs/WorkerConnectionConfiguration/properties/touchMode/enum", keyword: "enum", params: { allowedValues: schema124.properties.touchMode.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err59];
            } else {
              vErrors.push(err59);
            }
            errors++;
          }
        }
        if (data18.adbLite !== void 0) {
          if (typeof data18.adbLite !== "boolean") {
            const err60 = { instancePath: instancePath + "/connection/adbLite", schemaPath: "#/$defs/WorkerConnectionConfiguration/properties/adbLite/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err60];
            } else {
              vErrors.push(err60);
            }
            errors++;
          }
        }
        if (data18.clientType !== void 0) {
          let data22 = data18.clientType;
          if (!(data22 === "Official" || data22 === "Bilibili" || data22 === "YoStarEN" || data22 === "YoStarJP" || data22 === "YoStarKR" || data22 === "txwy")) {
            const err61 = { instancePath: instancePath + "/connection/clientType", schemaPath: "#/$defs/WorkerConnectionConfiguration/properties/clientType/enum", keyword: "enum", params: { allowedValues: schema124.properties.clientType.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err61];
            } else {
              vErrors.push(err61);
            }
            errors++;
          }
        }
      } else {
        const err62 = { instancePath: instancePath + "/connection", schemaPath: "#/$defs/WorkerConnectionConfiguration/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err62];
        } else {
          vErrors.push(err62);
        }
        errors++;
      }
    }
    if (data.lockTimeoutMs !== void 0) {
      let data23 = data.lockTimeoutMs;
      if (!(typeof data23 == "number" && (!(data23 % 1) && !isNaN(data23)) && isFinite(data23))) {
        const err63 = { instancePath: instancePath + "/lockTimeoutMs", schemaPath: "#/properties/lockTimeoutMs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err63];
        } else {
          vErrors.push(err63);
        }
        errors++;
      }
      if (typeof data23 == "number" && isFinite(data23)) {
        if (data23 > 6e4 || isNaN(data23)) {
          const err64 = { instancePath: instancePath + "/lockTimeoutMs", schemaPath: "#/properties/lockTimeoutMs/maximum", keyword: "maximum", params: { comparison: "<=", limit: 6e4 }, message: "must be <= 60000" };
          if (vErrors === null) {
            vErrors = [err64];
          } else {
            vErrors.push(err64);
          }
          errors++;
        }
        if (data23 < 0 || isNaN(data23)) {
          const err65 = { instancePath: instancePath + "/lockTimeoutMs", schemaPath: "#/properties/lockTimeoutMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err65];
          } else {
            vErrors.push(err65);
          }
          errors++;
        }
      }
    }
    if (data.startupTimeoutMs !== void 0) {
      let data24 = data.startupTimeoutMs;
      if (!(typeof data24 == "number" && (!(data24 % 1) && !isNaN(data24)) && isFinite(data24))) {
        const err66 = { instancePath: instancePath + "/startupTimeoutMs", schemaPath: "#/properties/startupTimeoutMs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err66];
        } else {
          vErrors.push(err66);
        }
        errors++;
      }
      if (typeof data24 == "number" && isFinite(data24)) {
        if (data24 > 12e4 || isNaN(data24)) {
          const err67 = { instancePath: instancePath + "/startupTimeoutMs", schemaPath: "#/properties/startupTimeoutMs/maximum", keyword: "maximum", params: { comparison: "<=", limit: 12e4 }, message: "must be <= 120000" };
          if (vErrors === null) {
            vErrors = [err67];
          } else {
            vErrors.push(err67);
          }
          errors++;
        }
        if (data24 < 1 || isNaN(data24)) {
          const err68 = { instancePath: instancePath + "/startupTimeoutMs", schemaPath: "#/properties/startupTimeoutMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
          if (vErrors === null) {
            vErrors = [err68];
          } else {
            vErrors.push(err68);
          }
          errors++;
        }
      }
    }
    if (data.nativeCallTimeoutMs !== void 0) {
      let data25 = data.nativeCallTimeoutMs;
      if (!(typeof data25 == "number" && (!(data25 % 1) && !isNaN(data25)) && isFinite(data25))) {
        const err69 = { instancePath: instancePath + "/nativeCallTimeoutMs", schemaPath: "#/properties/nativeCallTimeoutMs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err69];
        } else {
          vErrors.push(err69);
        }
        errors++;
      }
      if (typeof data25 == "number" && isFinite(data25)) {
        if (data25 > 12e4 || isNaN(data25)) {
          const err70 = { instancePath: instancePath + "/nativeCallTimeoutMs", schemaPath: "#/properties/nativeCallTimeoutMs/maximum", keyword: "maximum", params: { comparison: "<=", limit: 12e4 }, message: "must be <= 120000" };
          if (vErrors === null) {
            vErrors = [err70];
          } else {
            vErrors.push(err70);
          }
          errors++;
        }
        if (data25 < 1 || isNaN(data25)) {
          const err71 = { instancePath: instancePath + "/nativeCallTimeoutMs", schemaPath: "#/properties/nativeCallTimeoutMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
          if (vErrors === null) {
            vErrors = [err71];
          } else {
            vErrors.push(err71);
          }
          errors++;
        }
      }
    }
    if (data.asyncTimeoutMs !== void 0) {
      let data26 = data.asyncTimeoutMs;
      if (!(typeof data26 == "number" && (!(data26 % 1) && !isNaN(data26)) && isFinite(data26))) {
        const err72 = { instancePath: instancePath + "/asyncTimeoutMs", schemaPath: "#/properties/asyncTimeoutMs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err72];
        } else {
          vErrors.push(err72);
        }
        errors++;
      }
      if (typeof data26 == "number" && isFinite(data26)) {
        if (data26 > 12e4 || isNaN(data26)) {
          const err73 = { instancePath: instancePath + "/asyncTimeoutMs", schemaPath: "#/properties/asyncTimeoutMs/maximum", keyword: "maximum", params: { comparison: "<=", limit: 12e4 }, message: "must be <= 120000" };
          if (vErrors === null) {
            vErrors = [err73];
          } else {
            vErrors.push(err73);
          }
          errors++;
        }
        if (data26 < 1 || isNaN(data26)) {
          const err74 = { instancePath: instancePath + "/asyncTimeoutMs", schemaPath: "#/properties/asyncTimeoutMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
          if (vErrors === null) {
            vErrors = [err74];
          } else {
            vErrors.push(err74);
          }
          errors++;
        }
      }
    }
    if (data.shutdownTimeoutMs !== void 0) {
      let data27 = data.shutdownTimeoutMs;
      if (!(typeof data27 == "number" && (!(data27 % 1) && !isNaN(data27)) && isFinite(data27))) {
        const err75 = { instancePath: instancePath + "/shutdownTimeoutMs", schemaPath: "#/properties/shutdownTimeoutMs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err75];
        } else {
          vErrors.push(err75);
        }
        errors++;
      }
      if (typeof data27 == "number" && isFinite(data27)) {
        if (data27 > 12e4 || isNaN(data27)) {
          const err76 = { instancePath: instancePath + "/shutdownTimeoutMs", schemaPath: "#/properties/shutdownTimeoutMs/maximum", keyword: "maximum", params: { comparison: "<=", limit: 12e4 }, message: "must be <= 120000" };
          if (vErrors === null) {
            vErrors = [err76];
          } else {
            vErrors.push(err76);
          }
          errors++;
        }
        if (data27 < 1 || isNaN(data27)) {
          const err77 = { instancePath: instancePath + "/shutdownTimeoutMs", schemaPath: "#/properties/shutdownTimeoutMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
          if (vErrors === null) {
            vErrors = [err77];
          } else {
            vErrors.push(err77);
          }
          errors++;
        }
      }
    }
  } else {
    const err78 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err78];
    } else {
      vErrors.push(err78);
    }
    errors++;
  }
  validate87.errors = vErrors;
  return errors === 0;
}
var validateWorkerLeaseConfiguration = validate88;
function validate88(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.protocolVersion === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "protocolVersion" }, message: "must have required property 'protocolVersion'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.lockPath === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "lockPath" }, message: "must have required property 'lockPath'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "protocolVersion" || key0 === "lockPath" || key0 === "lockTimeoutMs")) {
        const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.protocolVersion !== void 0) {
      if (1 !== data.protocolVersion) {
        const err3 = { instancePath: instancePath + "/protocolVersion", schemaPath: "#/properties/protocolVersion/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.lockPath !== void 0) {
      let data1 = data.lockPath;
      if (typeof data1 === "string") {
        if (func3(data1) < 1) {
          const err4 = { instancePath: instancePath + "/lockPath", schemaPath: "#/properties/lockPath/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
      } else {
        const err5 = { instancePath: instancePath + "/lockPath", schemaPath: "#/properties/lockPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.lockTimeoutMs !== void 0) {
      let data2 = data.lockTimeoutMs;
      if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
        const err6 = { instancePath: instancePath + "/lockTimeoutMs", schemaPath: "#/properties/lockTimeoutMs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
      if (typeof data2 == "number" && isFinite(data2)) {
        if (data2 > 6e4 || isNaN(data2)) {
          const err7 = { instancePath: instancePath + "/lockTimeoutMs", schemaPath: "#/properties/lockTimeoutMs/maximum", keyword: "maximum", params: { comparison: "<=", limit: 6e4 }, message: "must be <= 60000" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (data2 < 0 || isNaN(data2)) {
          const err8 = { instancePath: instancePath + "/lockTimeoutMs", schemaPath: "#/properties/lockTimeoutMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      }
    }
  } else {
    const err9 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err9];
    } else {
      vErrors.push(err9);
    }
    errors++;
  }
  validate88.errors = vErrors;
  return errors === 0;
}
var validateWorkerValidationConfiguration = validate89;
function validate89(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.protocolVersion === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "protocolVersion" }, message: "must have required property 'protocolVersion'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.core === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "core" }, message: "must have required property 'core'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.resource === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "resource" }, message: "must have required property 'resource'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.version === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "version" }, message: "must have required property 'version'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "protocolVersion" || key0 === "core" || key0 === "resource" || key0 === "version" || key0 === "nativeCallTimeoutMs")) {
        const err4 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    if (data.protocolVersion !== void 0) {
      if (1 !== data.protocolVersion) {
        const err5 = { instancePath: instancePath + "/protocolVersion", schemaPath: "#/properties/protocolVersion/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.core !== void 0) {
      let data1 = data.core;
      if (typeof data1 === "string") {
        if (func3(data1) < 1) {
          const err6 = { instancePath: instancePath + "/core", schemaPath: "#/properties/core/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
      } else {
        const err7 = { instancePath: instancePath + "/core", schemaPath: "#/properties/core/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.resource !== void 0) {
      let data2 = data.resource;
      if (typeof data2 === "string") {
        if (func3(data2) < 1) {
          const err8 = { instancePath: instancePath + "/resource", schemaPath: "#/properties/resource/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
      } else {
        const err9 = { instancePath: instancePath + "/resource", schemaPath: "#/properties/resource/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.version !== void 0) {
      let data3 = data.version;
      if (typeof data3 === "string") {
        if (func3(data3) < 1) {
          const err10 = { instancePath: instancePath + "/version", schemaPath: "#/properties/version/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
      } else {
        const err11 = { instancePath: instancePath + "/version", schemaPath: "#/properties/version/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.nativeCallTimeoutMs !== void 0) {
      let data4 = data.nativeCallTimeoutMs;
      if (!(typeof data4 == "number" && (!(data4 % 1) && !isNaN(data4)) && isFinite(data4))) {
        const err12 = { instancePath: instancePath + "/nativeCallTimeoutMs", schemaPath: "#/properties/nativeCallTimeoutMs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
      if (typeof data4 == "number" && isFinite(data4)) {
        if (data4 > 12e4 || isNaN(data4)) {
          const err13 = { instancePath: instancePath + "/nativeCallTimeoutMs", schemaPath: "#/properties/nativeCallTimeoutMs/maximum", keyword: "maximum", params: { comparison: "<=", limit: 12e4 }, message: "must be <= 120000" };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
        if (data4 < 1 || isNaN(data4)) {
          const err14 = { instancePath: instancePath + "/nativeCallTimeoutMs", schemaPath: "#/properties/nativeCallTimeoutMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
      }
    }
  } else {
    const err15 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err15];
    } else {
      vErrors.push(err15);
    }
    errors++;
  }
  validate89.errors = vErrors;
  return errors === 0;
}
var validateWorkerCommand = validate90;
var schema127 = { "oneOf": [{ "type": "object", "additionalProperties": false, "required": ["protocolVersion", "id", "operation"], "properties": { "protocolVersion": { "const": 1 }, "id": { "type": ["string", "integer"] }, "operation": { "enum": ["connect", "stop", "screencap", "frame"] } } }, { "type": "object", "additionalProperties": false, "required": ["protocolVersion", "id", "operation", "x", "y"], "properties": { "protocolVersion": { "const": 1 }, "id": { "type": ["string", "integer"] }, "operation": { "const": "click" }, "x": { "type": "integer", "minimum": 0, "maximum": 8191 }, "y": { "type": "integer", "minimum": 0, "maximum": 8191 } } }, { "type": "object", "additionalProperties": false, "required": ["protocolVersion", "id", "operation", "task"], "properties": { "protocolVersion": { "const": 1 }, "id": { "type": ["string", "integer"] }, "operation": { "const": "task" }, "task": { "type": "object", "additionalProperties": false, "required": ["type", "params"], "properties": { "type": { "type": "string", "minLength": 1 }, "params": { "type": "object", "additionalProperties": true } } } } }] };
function validate90(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.protocolVersion === void 0) {
      const err0 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "protocolVersion" }, message: "must have required property 'protocolVersion'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.id === void 0) {
      const err1 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.operation === void 0) {
      const err2 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "operation" }, message: "must have required property 'operation'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "protocolVersion" || key0 === "id" || key0 === "operation")) {
        const err3 = { instancePath, schemaPath: "#/oneOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.protocolVersion !== void 0) {
      if (1 !== data.protocolVersion) {
        const err4 = { instancePath: instancePath + "/protocolVersion", schemaPath: "#/oneOf/0/properties/protocolVersion/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    if (data.id !== void 0) {
      let data1 = data.id;
      if (typeof data1 !== "string" && !(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
        const err5 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/0/properties/id/type", keyword: "type", params: { type: schema127.oneOf[0].properties.id.type }, message: "must be string,integer" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.operation !== void 0) {
      let data2 = data.operation;
      if (!(data2 === "connect" || data2 === "stop" || data2 === "screencap" || data2 === "frame")) {
        const err6 = { instancePath: instancePath + "/operation", schemaPath: "#/oneOf/0/properties/operation/enum", keyword: "enum", params: { allowedValues: schema127.oneOf[0].properties.operation.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
  } else {
    const err7 = { instancePath, schemaPath: "#/oneOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err7];
    } else {
      vErrors.push(err7);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs8 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.protocolVersion === void 0) {
      const err8 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "protocolVersion" }, message: "must have required property 'protocolVersion'" };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    if (data.id === void 0) {
      const err9 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
      if (vErrors === null) {
        vErrors = [err9];
      } else {
        vErrors.push(err9);
      }
      errors++;
    }
    if (data.operation === void 0) {
      const err10 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "operation" }, message: "must have required property 'operation'" };
      if (vErrors === null) {
        vErrors = [err10];
      } else {
        vErrors.push(err10);
      }
      errors++;
    }
    if (data.x === void 0) {
      const err11 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "x" }, message: "must have required property 'x'" };
      if (vErrors === null) {
        vErrors = [err11];
      } else {
        vErrors.push(err11);
      }
      errors++;
    }
    if (data.y === void 0) {
      const err12 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "y" }, message: "must have required property 'y'" };
      if (vErrors === null) {
        vErrors = [err12];
      } else {
        vErrors.push(err12);
      }
      errors++;
    }
    for (const key1 in data) {
      if (!(key1 === "protocolVersion" || key1 === "id" || key1 === "operation" || key1 === "x" || key1 === "y")) {
        const err13 = { instancePath, schemaPath: "#/oneOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
    if (data.protocolVersion !== void 0) {
      if (1 !== data.protocolVersion) {
        const err14 = { instancePath: instancePath + "/protocolVersion", schemaPath: "#/oneOf/1/properties/protocolVersion/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    if (data.id !== void 0) {
      let data4 = data.id;
      if (typeof data4 !== "string" && !(typeof data4 == "number" && (!(data4 % 1) && !isNaN(data4)) && isFinite(data4))) {
        const err15 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/1/properties/id/type", keyword: "type", params: { type: schema127.oneOf[1].properties.id.type }, message: "must be string,integer" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
    if (data.operation !== void 0) {
      if ("click" !== data.operation) {
        const err16 = { instancePath: instancePath + "/operation", schemaPath: "#/oneOf/1/properties/operation/const", keyword: "const", params: { allowedValue: "click" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
    if (data.x !== void 0) {
      let data6 = data.x;
      if (!(typeof data6 == "number" && (!(data6 % 1) && !isNaN(data6)) && isFinite(data6))) {
        const err17 = { instancePath: instancePath + "/x", schemaPath: "#/oneOf/1/properties/x/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
      if (typeof data6 == "number" && isFinite(data6)) {
        if (data6 > 8191 || isNaN(data6)) {
          const err18 = { instancePath: instancePath + "/x", schemaPath: "#/oneOf/1/properties/x/maximum", keyword: "maximum", params: { comparison: "<=", limit: 8191 }, message: "must be <= 8191" };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
        if (data6 < 0 || isNaN(data6)) {
          const err19 = { instancePath: instancePath + "/x", schemaPath: "#/oneOf/1/properties/x/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
      }
    }
    if (data.y !== void 0) {
      let data7 = data.y;
      if (!(typeof data7 == "number" && (!(data7 % 1) && !isNaN(data7)) && isFinite(data7))) {
        const err20 = { instancePath: instancePath + "/y", schemaPath: "#/oneOf/1/properties/y/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
      if (typeof data7 == "number" && isFinite(data7)) {
        if (data7 > 8191 || isNaN(data7)) {
          const err21 = { instancePath: instancePath + "/y", schemaPath: "#/oneOf/1/properties/y/maximum", keyword: "maximum", params: { comparison: "<=", limit: 8191 }, message: "must be <= 8191" };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
        if (data7 < 0 || isNaN(data7)) {
          const err22 = { instancePath: instancePath + "/y", schemaPath: "#/oneOf/1/properties/y/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err22];
          } else {
            vErrors.push(err22);
          }
          errors++;
        }
      }
    }
  } else {
    const err23 = { instancePath, schemaPath: "#/oneOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err23];
    } else {
      vErrors.push(err23);
    }
    errors++;
  }
  var _valid0 = _errs8 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs19 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.protocolVersion === void 0) {
        const err24 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "protocolVersion" }, message: "must have required property 'protocolVersion'" };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
      if (data.id === void 0) {
        const err25 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
      if (data.operation === void 0) {
        const err26 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "operation" }, message: "must have required property 'operation'" };
        if (vErrors === null) {
          vErrors = [err26];
        } else {
          vErrors.push(err26);
        }
        errors++;
      }
      if (data.task === void 0) {
        const err27 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "task" }, message: "must have required property 'task'" };
        if (vErrors === null) {
          vErrors = [err27];
        } else {
          vErrors.push(err27);
        }
        errors++;
      }
      for (const key2 in data) {
        if (!(key2 === "protocolVersion" || key2 === "id" || key2 === "operation" || key2 === "task")) {
          const err28 = { instancePath, schemaPath: "#/oneOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
          if (vErrors === null) {
            vErrors = [err28];
          } else {
            vErrors.push(err28);
          }
          errors++;
        }
      }
      if (data.protocolVersion !== void 0) {
        if (1 !== data.protocolVersion) {
          const err29 = { instancePath: instancePath + "/protocolVersion", schemaPath: "#/oneOf/2/properties/protocolVersion/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" };
          if (vErrors === null) {
            vErrors = [err29];
          } else {
            vErrors.push(err29);
          }
          errors++;
        }
      }
      if (data.id !== void 0) {
        let data9 = data.id;
        if (typeof data9 !== "string" && !(typeof data9 == "number" && (!(data9 % 1) && !isNaN(data9)) && isFinite(data9))) {
          const err30 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/2/properties/id/type", keyword: "type", params: { type: schema127.oneOf[2].properties.id.type }, message: "must be string,integer" };
          if (vErrors === null) {
            vErrors = [err30];
          } else {
            vErrors.push(err30);
          }
          errors++;
        }
      }
      if (data.operation !== void 0) {
        if ("task" !== data.operation) {
          const err31 = { instancePath: instancePath + "/operation", schemaPath: "#/oneOf/2/properties/operation/const", keyword: "const", params: { allowedValue: "task" }, message: "must be equal to constant" };
          if (vErrors === null) {
            vErrors = [err31];
          } else {
            vErrors.push(err31);
          }
          errors++;
        }
      }
      if (data.task !== void 0) {
        let data11 = data.task;
        if (data11 && typeof data11 == "object" && !Array.isArray(data11)) {
          if (data11.type === void 0) {
            const err32 = { instancePath: instancePath + "/task", schemaPath: "#/oneOf/2/properties/task/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
            if (vErrors === null) {
              vErrors = [err32];
            } else {
              vErrors.push(err32);
            }
            errors++;
          }
          if (data11.params === void 0) {
            const err33 = { instancePath: instancePath + "/task", schemaPath: "#/oneOf/2/properties/task/required", keyword: "required", params: { missingProperty: "params" }, message: "must have required property 'params'" };
            if (vErrors === null) {
              vErrors = [err33];
            } else {
              vErrors.push(err33);
            }
            errors++;
          }
          for (const key3 in data11) {
            if (!(key3 === "type" || key3 === "params")) {
              const err34 = { instancePath: instancePath + "/task", schemaPath: "#/oneOf/2/properties/task/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err34];
              } else {
                vErrors.push(err34);
              }
              errors++;
            }
          }
          if (data11.type !== void 0) {
            let data12 = data11.type;
            if (typeof data12 === "string") {
              if (func3(data12) < 1) {
                const err35 = { instancePath: instancePath + "/task/type", schemaPath: "#/oneOf/2/properties/task/properties/type/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                if (vErrors === null) {
                  vErrors = [err35];
                } else {
                  vErrors.push(err35);
                }
                errors++;
              }
            } else {
              const err36 = { instancePath: instancePath + "/task/type", schemaPath: "#/oneOf/2/properties/task/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err36];
              } else {
                vErrors.push(err36);
              }
              errors++;
            }
          }
          if (data11.params !== void 0) {
            let data13 = data11.params;
            if (data13 && typeof data13 == "object" && !Array.isArray(data13)) {
            } else {
              const err37 = { instancePath: instancePath + "/task/params", schemaPath: "#/oneOf/2/properties/task/properties/params/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err37];
              } else {
                vErrors.push(err37);
              }
              errors++;
            }
          }
        } else {
          const err38 = { instancePath: instancePath + "/task", schemaPath: "#/oneOf/2/properties/task/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err38];
          } else {
            vErrors.push(err38);
          }
          errors++;
        }
      }
    } else {
      const err39 = { instancePath, schemaPath: "#/oneOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
      if (vErrors === null) {
        vErrors = [err39];
      } else {
        vErrors.push(err39);
      }
      errors++;
    }
    var _valid0 = _errs19 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
    }
  }
  if (!valid0) {
    const err40 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 }, message: "must match exactly one schema in oneOf" };
    if (vErrors === null) {
      vErrors = [err40];
    } else {
      vErrors.push(err40);
    }
    errors++;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate90.errors = vErrors;
  return errors === 0;
}
var validateWorkerEvent = validate91;
var schema128 = { "oneOf": [{ "type": "object", "additionalProperties": false, "required": ["protocolVersion", "type"], "properties": { "protocolVersion": { "const": 1 }, "type": { "const": "ready" }, "mode": { "const": "lease-only" } } }, { "type": "object", "additionalProperties": false, "required": ["protocolVersion", "type", "id", "result"], "properties": { "protocolVersion": { "const": 1 }, "type": { "const": "response" }, "id": { "type": ["string", "integer", "null"] }, "result": { "type": "object", "additionalProperties": true } } }, { "type": "object", "additionalProperties": false, "required": ["protocolVersion", "type", "id", "error"], "properties": { "protocolVersion": { "const": 1 }, "type": { "const": "response" }, "id": { "type": ["string", "integer", "null"] }, "error": { "type": "string" } } }, { "type": "object", "additionalProperties": false, "required": ["protocolVersion", "type", "message", "details"], "properties": { "protocolVersion": { "const": 1 }, "type": { "const": "callback" }, "message": { "type": "integer" }, "details": { "type": "object", "additionalProperties": true } } }, { "type": "object", "additionalProperties": false, "required": ["protocolVersion", "type", "running", "pendingAsync"], "properties": { "protocolVersion": { "const": 1 }, "type": { "const": "status" }, "running": { "type": "boolean" }, "pendingAsync": { "type": "array", "items": { "type": "integer", "minimum": 1 }, "uniqueItems": true } } }] };
function validate91(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.protocolVersion === void 0) {
      const err0 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "protocolVersion" }, message: "must have required property 'protocolVersion'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.type === void 0) {
      const err1 = { instancePath, schemaPath: "#/oneOf/0/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "protocolVersion" || key0 === "type" || key0 === "mode")) {
        const err2 = { instancePath, schemaPath: "#/oneOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.protocolVersion !== void 0) {
      if (1 !== data.protocolVersion) {
        const err3 = { instancePath: instancePath + "/protocolVersion", schemaPath: "#/oneOf/0/properties/protocolVersion/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.type !== void 0) {
      if ("ready" !== data.type) {
        const err4 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/0/properties/type/const", keyword: "const", params: { allowedValue: "ready" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    if (data.mode !== void 0) {
      if ("lease-only" !== data.mode) {
        const err5 = { instancePath: instancePath + "/mode", schemaPath: "#/oneOf/0/properties/mode/const", keyword: "const", params: { allowedValue: "lease-only" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
  } else {
    const err6 = { instancePath, schemaPath: "#/oneOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err6];
    } else {
      vErrors.push(err6);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs7 = errors;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.protocolVersion === void 0) {
      const err7 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "protocolVersion" }, message: "must have required property 'protocolVersion'" };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.type === void 0) {
      const err8 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    if (data.id === void 0) {
      const err9 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
      if (vErrors === null) {
        vErrors = [err9];
      } else {
        vErrors.push(err9);
      }
      errors++;
    }
    if (data.result === void 0) {
      const err10 = { instancePath, schemaPath: "#/oneOf/1/required", keyword: "required", params: { missingProperty: "result" }, message: "must have required property 'result'" };
      if (vErrors === null) {
        vErrors = [err10];
      } else {
        vErrors.push(err10);
      }
      errors++;
    }
    for (const key1 in data) {
      if (!(key1 === "protocolVersion" || key1 === "type" || key1 === "id" || key1 === "result")) {
        const err11 = { instancePath, schemaPath: "#/oneOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.protocolVersion !== void 0) {
      if (1 !== data.protocolVersion) {
        const err12 = { instancePath: instancePath + "/protocolVersion", schemaPath: "#/oneOf/1/properties/protocolVersion/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.type !== void 0) {
      if ("response" !== data.type) {
        const err13 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/1/properties/type/const", keyword: "const", params: { allowedValue: "response" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
    if (data.id !== void 0) {
      let data5 = data.id;
      if (typeof data5 !== "string" && !(typeof data5 == "number" && (!(data5 % 1) && !isNaN(data5)) && isFinite(data5)) && data5 !== null) {
        const err14 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/1/properties/id/type", keyword: "type", params: { type: schema128.oneOf[1].properties.id.type }, message: "must be string,integer,null" };
        if (vErrors === null) {
          vErrors = [err14];
        } else {
          vErrors.push(err14);
        }
        errors++;
      }
    }
    if (data.result !== void 0) {
      let data6 = data.result;
      if (data6 && typeof data6 == "object" && !Array.isArray(data6)) {
      } else {
        const err15 = { instancePath: instancePath + "/result", schemaPath: "#/oneOf/1/properties/result/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
    }
  } else {
    const err16 = { instancePath, schemaPath: "#/oneOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err16];
    } else {
      vErrors.push(err16);
    }
    errors++;
  }
  var _valid0 = _errs7 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
    const _errs17 = errors;
    if (data && typeof data == "object" && !Array.isArray(data)) {
      if (data.protocolVersion === void 0) {
        const err17 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "protocolVersion" }, message: "must have required property 'protocolVersion'" };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
      if (data.type === void 0) {
        const err18 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
        if (vErrors === null) {
          vErrors = [err18];
        } else {
          vErrors.push(err18);
        }
        errors++;
      }
      if (data.id === void 0) {
        const err19 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
      if (data.error === void 0) {
        const err20 = { instancePath, schemaPath: "#/oneOf/2/required", keyword: "required", params: { missingProperty: "error" }, message: "must have required property 'error'" };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
      for (const key2 in data) {
        if (!(key2 === "protocolVersion" || key2 === "type" || key2 === "id" || key2 === "error")) {
          const err21 = { instancePath, schemaPath: "#/oneOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
      }
      if (data.protocolVersion !== void 0) {
        if (1 !== data.protocolVersion) {
          const err22 = { instancePath: instancePath + "/protocolVersion", schemaPath: "#/oneOf/2/properties/protocolVersion/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" };
          if (vErrors === null) {
            vErrors = [err22];
          } else {
            vErrors.push(err22);
          }
          errors++;
        }
      }
      if (data.type !== void 0) {
        if ("response" !== data.type) {
          const err23 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/2/properties/type/const", keyword: "const", params: { allowedValue: "response" }, message: "must be equal to constant" };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      }
      if (data.id !== void 0) {
        let data9 = data.id;
        if (typeof data9 !== "string" && !(typeof data9 == "number" && (!(data9 % 1) && !isNaN(data9)) && isFinite(data9)) && data9 !== null) {
          const err24 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/2/properties/id/type", keyword: "type", params: { type: schema128.oneOf[2].properties.id.type }, message: "must be string,integer,null" };
          if (vErrors === null) {
            vErrors = [err24];
          } else {
            vErrors.push(err24);
          }
          errors++;
        }
      }
      if (data.error !== void 0) {
        if (typeof data.error !== "string") {
          const err25 = { instancePath: instancePath + "/error", schemaPath: "#/oneOf/2/properties/error/type", keyword: "type", params: { type: "string" }, message: "must be string" };
          if (vErrors === null) {
            vErrors = [err25];
          } else {
            vErrors.push(err25);
          }
          errors++;
        }
      }
    } else {
      const err26 = { instancePath, schemaPath: "#/oneOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
      if (vErrors === null) {
        vErrors = [err26];
      } else {
        vErrors.push(err26);
      }
      errors++;
    }
    var _valid0 = _errs17 === errors;
    if (_valid0 && valid0) {
      valid0 = false;
      passing0 = [passing0, 2];
    } else {
      if (_valid0) {
        valid0 = true;
        passing0 = 2;
      }
      const _errs26 = errors;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.protocolVersion === void 0) {
          const err27 = { instancePath, schemaPath: "#/oneOf/3/required", keyword: "required", params: { missingProperty: "protocolVersion" }, message: "must have required property 'protocolVersion'" };
          if (vErrors === null) {
            vErrors = [err27];
          } else {
            vErrors.push(err27);
          }
          errors++;
        }
        if (data.type === void 0) {
          const err28 = { instancePath, schemaPath: "#/oneOf/3/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
          if (vErrors === null) {
            vErrors = [err28];
          } else {
            vErrors.push(err28);
          }
          errors++;
        }
        if (data.message === void 0) {
          const err29 = { instancePath, schemaPath: "#/oneOf/3/required", keyword: "required", params: { missingProperty: "message" }, message: "must have required property 'message'" };
          if (vErrors === null) {
            vErrors = [err29];
          } else {
            vErrors.push(err29);
          }
          errors++;
        }
        if (data.details === void 0) {
          const err30 = { instancePath, schemaPath: "#/oneOf/3/required", keyword: "required", params: { missingProperty: "details" }, message: "must have required property 'details'" };
          if (vErrors === null) {
            vErrors = [err30];
          } else {
            vErrors.push(err30);
          }
          errors++;
        }
        for (const key3 in data) {
          if (!(key3 === "protocolVersion" || key3 === "type" || key3 === "message" || key3 === "details")) {
            const err31 = { instancePath, schemaPath: "#/oneOf/3/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err31];
            } else {
              vErrors.push(err31);
            }
            errors++;
          }
        }
        if (data.protocolVersion !== void 0) {
          if (1 !== data.protocolVersion) {
            const err32 = { instancePath: instancePath + "/protocolVersion", schemaPath: "#/oneOf/3/properties/protocolVersion/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err32];
            } else {
              vErrors.push(err32);
            }
            errors++;
          }
        }
        if (data.type !== void 0) {
          if ("callback" !== data.type) {
            const err33 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/3/properties/type/const", keyword: "const", params: { allowedValue: "callback" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err33];
            } else {
              vErrors.push(err33);
            }
            errors++;
          }
        }
        if (data.message !== void 0) {
          let data13 = data.message;
          if (!(typeof data13 == "number" && (!(data13 % 1) && !isNaN(data13)) && isFinite(data13))) {
            const err34 = { instancePath: instancePath + "/message", schemaPath: "#/oneOf/3/properties/message/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err34];
            } else {
              vErrors.push(err34);
            }
            errors++;
          }
        }
        if (data.details !== void 0) {
          let data14 = data.details;
          if (data14 && typeof data14 == "object" && !Array.isArray(data14)) {
          } else {
            const err35 = { instancePath: instancePath + "/details", schemaPath: "#/oneOf/3/properties/details/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err35];
            } else {
              vErrors.push(err35);
            }
            errors++;
          }
        }
      } else {
        const err36 = { instancePath, schemaPath: "#/oneOf/3/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err36];
        } else {
          vErrors.push(err36);
        }
        errors++;
      }
      var _valid0 = _errs26 === errors;
      if (_valid0 && valid0) {
        valid0 = false;
        passing0 = [passing0, 3];
      } else {
        if (_valid0) {
          valid0 = true;
          passing0 = 3;
        }
        const _errs36 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.protocolVersion === void 0) {
            const err37 = { instancePath, schemaPath: "#/oneOf/4/required", keyword: "required", params: { missingProperty: "protocolVersion" }, message: "must have required property 'protocolVersion'" };
            if (vErrors === null) {
              vErrors = [err37];
            } else {
              vErrors.push(err37);
            }
            errors++;
          }
          if (data.type === void 0) {
            const err38 = { instancePath, schemaPath: "#/oneOf/4/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
            if (vErrors === null) {
              vErrors = [err38];
            } else {
              vErrors.push(err38);
            }
            errors++;
          }
          if (data.running === void 0) {
            const err39 = { instancePath, schemaPath: "#/oneOf/4/required", keyword: "required", params: { missingProperty: "running" }, message: "must have required property 'running'" };
            if (vErrors === null) {
              vErrors = [err39];
            } else {
              vErrors.push(err39);
            }
            errors++;
          }
          if (data.pendingAsync === void 0) {
            const err40 = { instancePath, schemaPath: "#/oneOf/4/required", keyword: "required", params: { missingProperty: "pendingAsync" }, message: "must have required property 'pendingAsync'" };
            if (vErrors === null) {
              vErrors = [err40];
            } else {
              vErrors.push(err40);
            }
            errors++;
          }
          for (const key4 in data) {
            if (!(key4 === "protocolVersion" || key4 === "type" || key4 === "running" || key4 === "pendingAsync")) {
              const err41 = { instancePath, schemaPath: "#/oneOf/4/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err41];
              } else {
                vErrors.push(err41);
              }
              errors++;
            }
          }
          if (data.protocolVersion !== void 0) {
            if (1 !== data.protocolVersion) {
              const err42 = { instancePath: instancePath + "/protocolVersion", schemaPath: "#/oneOf/4/properties/protocolVersion/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err42];
              } else {
                vErrors.push(err42);
              }
              errors++;
            }
          }
          if (data.type !== void 0) {
            if ("status" !== data.type) {
              const err43 = { instancePath: instancePath + "/type", schemaPath: "#/oneOf/4/properties/type/const", keyword: "const", params: { allowedValue: "status" }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err43];
              } else {
                vErrors.push(err43);
              }
              errors++;
            }
          }
          if (data.running !== void 0) {
            if (typeof data.running !== "boolean") {
              const err44 = { instancePath: instancePath + "/running", schemaPath: "#/oneOf/4/properties/running/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
              if (vErrors === null) {
                vErrors = [err44];
              } else {
                vErrors.push(err44);
              }
              errors++;
            }
          }
          if (data.pendingAsync !== void 0) {
            let data18 = data.pendingAsync;
            if (Array.isArray(data18)) {
              const len0 = data18.length;
              for (let i0 = 0; i0 < len0; i0++) {
                let data19 = data18[i0];
                if (!(typeof data19 == "number" && (!(data19 % 1) && !isNaN(data19)) && isFinite(data19))) {
                  const err45 = { instancePath: instancePath + "/pendingAsync/" + i0, schemaPath: "#/oneOf/4/properties/pendingAsync/items/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                  if (vErrors === null) {
                    vErrors = [err45];
                  } else {
                    vErrors.push(err45);
                  }
                  errors++;
                }
                if (typeof data19 == "number" && isFinite(data19)) {
                  if (data19 < 1 || isNaN(data19)) {
                    const err46 = { instancePath: instancePath + "/pendingAsync/" + i0, schemaPath: "#/oneOf/4/properties/pendingAsync/items/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                    if (vErrors === null) {
                      vErrors = [err46];
                    } else {
                      vErrors.push(err46);
                    }
                    errors++;
                  }
                }
              }
              let i1 = data18.length;
              let j0;
              if (i1 > 1) {
                const indices0 = {};
                for (; i1--; ) {
                  let item0 = data18[i1];
                  if (!(typeof item0 == "number" && (!(item0 % 1) && !isNaN(item0)) && isFinite(item0))) {
                    continue;
                  }
                  if (typeof indices0[item0] == "number") {
                    j0 = indices0[item0];
                    const err47 = { instancePath: instancePath + "/pendingAsync", schemaPath: "#/oneOf/4/properties/pendingAsync/uniqueItems", keyword: "uniqueItems", params: { i: i1, j: j0 }, message: "must NOT have duplicate items (items ## " + j0 + " and " + i1 + " are identical)" };
                    if (vErrors === null) {
                      vErrors = [err47];
                    } else {
                      vErrors.push(err47);
                    }
                    errors++;
                    break;
                  }
                  indices0[item0] = i1;
                }
              }
            } else {
              const err48 = { instancePath: instancePath + "/pendingAsync", schemaPath: "#/oneOf/4/properties/pendingAsync/type", keyword: "type", params: { type: "array" }, message: "must be array" };
              if (vErrors === null) {
                vErrors = [err48];
              } else {
                vErrors.push(err48);
              }
              errors++;
            }
          }
        } else {
          const err49 = { instancePath, schemaPath: "#/oneOf/4/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err49];
          } else {
            vErrors.push(err49);
          }
          errors++;
        }
        var _valid0 = _errs36 === errors;
        if (_valid0 && valid0) {
          valid0 = false;
          passing0 = [passing0, 4];
        } else {
          if (_valid0) {
            valid0 = true;
            passing0 = 4;
          }
        }
      }
    }
  }
  if (!valid0) {
    const err50 = { instancePath, schemaPath: "#/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 }, message: "must match exactly one schema in oneOf" };
    if (vErrors === null) {
      vErrors = [err50];
    } else {
      vErrors.push(err50);
    }
    errors++;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate91.errors = vErrors;
  return errors === 0;
}
var validateWorkerValidation = validate92;
function validate92(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.protocolVersion === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "protocolVersion" }, message: "must have required property 'protocolVersion'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.version === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "version" }, message: "must have required property 'version'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.resourceLoaded === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "resourceLoaded" }, message: "must have required property 'resourceLoaded'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === "protocolVersion" || key0 === "version" || key0 === "resourceLoaded")) {
        const err3 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err3];
        } else {
          vErrors.push(err3);
        }
        errors++;
      }
    }
    if (data.protocolVersion !== void 0) {
      if (1 !== data.protocolVersion) {
        const err4 = { instancePath: instancePath + "/protocolVersion", schemaPath: "#/properties/protocolVersion/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    if (data.version !== void 0) {
      if (typeof data.version !== "string") {
        const err5 = { instancePath: instancePath + "/version", schemaPath: "#/properties/version/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.resourceLoaded !== void 0) {
      if (true !== data.resourceLoaded) {
        const err6 = { instancePath: instancePath + "/resourceLoaded", schemaPath: "#/properties/resourceLoaded/const", keyword: "const", params: { allowedValue: true }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
  } else {
    const err7 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err7];
    } else {
      vErrors.push(err7);
    }
    errors++;
  }
  validate92.errors = vErrors;
  return errors === 0;
}
export {
  validateDeviceClickParams,
  validateDeviceFrameParams,
  validateItemResourceParams,
  validateItemResourceResult,
  validateOperatorResourceParams,
  validateOperatorResourceResult,
  validatePlan,
  validateRecognitionParams,
  validateRecognitionResult,
  validateRpcEvent,
  validateRpcRequest,
  validateRunArtifactParams,
  validateScreenFrame,
  validateSettings,
  validateSnapshot,
  validateStageListParams,
  validateStageListResult,
  validateWorkerCommand,
  validateWorkerConfiguration,
  validateWorkerEvent,
  validateWorkerFrame,
  validateWorkerLeaseConfiguration,
  validateWorkerValidation,
  validateWorkerValidationConfiguration
};
