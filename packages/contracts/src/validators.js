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
var schema11 = { "$schema": "http://json-schema.org/draft-07/schema#", "$id": "https://maaverge.local/contracts/runtime.schema.json", "$comment": "Authoritative runtime contract. Edit this source, then run pnpm contracts:generate. Defaults are applied by the application models, not validators.", "$defs": { "Budgets": { "additionalProperties": false, "properties": { "originium": { "default": 0, "maximum": 100, "minimum": 0, "title": "Originium", "type": "integer" }, "medicine": { "default": 0, "maximum": 100, "minimum": 0, "title": "Medicine", "type": "integer" }, "expedited": { "default": 0, "maximum": 100, "minimum": 0, "title": "Expedited", "type": "integer" } }, "required": ["originium", "medicine", "expedited"], "title": "Budgets", "type": "object" }, "CaptureSettings": { "type": "object", "additionalProperties": false, "properties": { "method": { "type": "string", "enum": ["adb", "mumu", "ldplayer"], "default": "adb" }, "emulatorPath": { "type": "string", "maxLength": 4096, "default": "" }, "instanceIndex": { "type": "integer", "minimum": 0, "maximum": 65535, "default": 0 } }, "required": ["method", "emulatorPath", "instanceIndex"] }, "Device": { "additionalProperties": false, "properties": { "id": { "title": "Id", "type": "string" }, "name": { "title": "Name", "type": "string" }, "address": { "title": "Address", "type": "string" }, "state": { "enum": ["idle", "running", "offline"], "title": "State", "type": "string" }, "coreVersion": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Coreversion" }, "captureMethod": { "type": "string", "maxLength": 128 }, "resourceVersion": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Resourceversion" } }, "required": ["id", "name", "address", "state", "coreVersion", "resourceVersion"], "title": "Device", "type": "object" }, "Event": { "additionalProperties": false, "properties": { "id": { "title": "Id", "type": "integer" }, "type": { "title": "Type", "type": "string" }, "message": { "title": "Message", "type": "string" }, "createdAt": { "title": "Createdat", "type": "string" }, "data": { "additionalProperties": true, "title": "Data", "type": "object" } }, "required": ["id", "type", "message", "createdAt", "data"], "title": "Event", "type": "object" }, "ModelSettings": { "additionalProperties": false, "properties": { "provider": { "default": "none", "title": "Provider", "type": "string" }, "baseUrl": { "default": "", "title": "Baseurl", "type": "string" }, "model": { "default": "", "title": "Model", "type": "string" } }, "required": ["provider", "baseUrl", "model"], "title": "ModelSettings", "type": "object" }, "Plan": { "additionalProperties": false, "properties": { "id": { "default": "", "title": "Id", "type": "string" }, "name": { "maxLength": 80, "minLength": 1, "title": "Name", "type": "string" }, "description": { "default": "", "maxLength": 500, "title": "Description", "type": "string" }, "deviceId": { "anyOf": [{ "maxLength": 200, "minLength": 1, "type": "string" }, { "type": "null" }], "default": null, "title": "Deviceid" }, "group": { "default": "daily", "enum": ["daily", "specialized"], "title": "Group", "type": "string" }, "budgets": { "anyOf": [{ "$ref": "#/$defs/Budgets" }, { "type": "null" }], "default": null }, "tasks": { "items": { "$ref": "#/$defs/Task" }, "maxItems": 30, "minItems": 1, "title": "Tasks", "type": "array" }, "schedule": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Schedule" }, "enabled": { "default": true, "title": "Enabled", "type": "boolean" } }, "required": ["id", "name", "description", "deviceId", "group", "budgets", "tasks", "schedule", "enabled"], "title": "Plan", "type": "object" }, "Run": { "additionalProperties": false, "properties": { "id": { "title": "Id", "type": "string" }, "planId": { "title": "Planid", "type": "string" }, "deviceId": { "title": "Deviceid", "type": "string" }, "status": { "enum": ["running", "completed", "failed", "stopped"], "title": "Status", "type": "string" }, "progress": { "maximum": 100, "minimum": 0, "title": "Progress", "type": "integer" }, "message": { "title": "Message", "type": "string" }, "startedAt": { "title": "Startedat", "type": "string" }, "finishedAt": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Finishedat" } }, "required": ["id", "planId", "deviceId", "status", "progress", "message", "startedAt", "finishedAt"], "title": "Run", "type": "object" }, "Settings": { "additionalProperties": false, "properties": { "capture": { "$ref": "#/$defs/CaptureSettings" }, "autoConnect": { "default": true, "title": "Autoconnect", "type": "boolean" }, "autoUpdateCore": { "default": true, "title": "Autoupdatecore", "type": "boolean" }, "autoUpdateResource": { "default": true, "title": "Autoupdateresource", "type": "boolean" }, "minimizeToTray": { "default": true, "title": "Minimizetotray", "type": "boolean" }, "theme": { "default": "system", "enum": ["dark", "light", "system"], "title": "Theme", "type": "string" }, "budgets": { "$ref": "#/$defs/Budgets" }, "model": { "$ref": "#/$defs/ModelSettings" } }, "required": ["autoConnect", "autoUpdateCore", "autoUpdateResource", "minimizeToTray", "theme", "budgets", "model"], "title": "Settings", "type": "object" }, "Task": { "additionalProperties": false, "properties": { "type": { "enum": ["StartUp", "CloseDown", "Fight", "Recruit", "Infrast", "Mall", "Award", "SwitchTheme", "Roguelike", "Copilot", "SSSCopilot", "ParadoxCopilot", "Depot", "OperBox", "Reclamation", "Custom", "SingleStep", "VideoRecognition", "OperProgress"], "title": "Type", "type": "string" }, "params": { "additionalProperties": true, "title": "Params", "type": "object" }, "enabled": { "default": true, "title": "Enabled", "type": "boolean" } }, "required": ["type", "params", "enabled"], "title": "Task", "type": "object" }, "UpdateChannel": { "additionalProperties": false, "properties": { "id": { "enum": ["app", "core", "resource"], "title": "Id", "type": "string" }, "currentVersion": { "title": "Currentversion", "type": "string" }, "latestVersion": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Latestversion" }, "status": { "default": "idle", "enum": ["idle", "checking", "available", "downloading", "staged", "waiting_idle", "active", "failed"], "title": "Status", "type": "string" }, "progress": { "default": 0, "maximum": 100, "minimum": 0, "title": "Progress", "type": "integer" }, "message": { "default": "", "title": "Message", "type": "string" } }, "required": ["id", "currentVersion", "latestVersion", "status", "progress", "message"], "title": "UpdateChannel", "type": "object" } }, "additionalProperties": false, "properties": { "mode": { "enum": ["native"], "title": "Mode", "type": "string" }, "devices": { "items": { "$ref": "#/$defs/Device" }, "title": "Devices", "type": "array" }, "plans": { "items": { "$ref": "#/$defs/Plan" }, "title": "Plans", "type": "array" }, "runs": { "items": { "$ref": "#/$defs/Run" }, "title": "Runs", "type": "array" }, "updates": { "items": { "$ref": "#/$defs/UpdateChannel" }, "title": "Updates", "type": "array" }, "settings": { "$ref": "#/$defs/Settings" }, "events": { "items": { "$ref": "#/$defs/Event" }, "title": "Events", "type": "array" } }, "required": ["mode", "devices", "plans", "runs", "updates", "settings", "events"], "title": "Snapshot", "type": "object" };
var schema12 = { "additionalProperties": false, "properties": { "id": { "title": "Id", "type": "string" }, "name": { "title": "Name", "type": "string" }, "address": { "title": "Address", "type": "string" }, "state": { "enum": ["idle", "running", "offline"], "title": "State", "type": "string" }, "coreVersion": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Coreversion" }, "captureMethod": { "type": "string", "maxLength": 128 }, "resourceVersion": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Resourceversion" } }, "required": ["id", "name", "address", "state", "coreVersion", "resourceVersion"], "title": "Device", "type": "object" };
var schema16 = { "additionalProperties": false, "properties": { "id": { "title": "Id", "type": "string" }, "planId": { "title": "Planid", "type": "string" }, "deviceId": { "title": "Deviceid", "type": "string" }, "status": { "enum": ["running", "completed", "failed", "stopped"], "title": "Status", "type": "string" }, "progress": { "maximum": 100, "minimum": 0, "title": "Progress", "type": "integer" }, "message": { "title": "Message", "type": "string" }, "startedAt": { "title": "Startedat", "type": "string" }, "finishedAt": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Finishedat" } }, "required": ["id", "planId", "deviceId", "status", "progress", "message", "startedAt", "finishedAt"], "title": "Run", "type": "object" };
var schema17 = { "additionalProperties": false, "properties": { "id": { "enum": ["app", "core", "resource"], "title": "Id", "type": "string" }, "currentVersion": { "title": "Currentversion", "type": "string" }, "latestVersion": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Latestversion" }, "status": { "default": "idle", "enum": ["idle", "checking", "available", "downloading", "staged", "waiting_idle", "active", "failed"], "title": "Status", "type": "string" }, "progress": { "default": 0, "maximum": 100, "minimum": 0, "title": "Progress", "type": "integer" }, "message": { "default": "", "title": "Message", "type": "string" } }, "required": ["id", "currentVersion", "latestVersion", "status", "progress", "message"], "title": "UpdateChannel", "type": "object" };
var func2 = require_ucs2length().default;
var schema13 = { "additionalProperties": false, "properties": { "id": { "default": "", "title": "Id", "type": "string" }, "name": { "maxLength": 80, "minLength": 1, "title": "Name", "type": "string" }, "description": { "default": "", "maxLength": 500, "title": "Description", "type": "string" }, "deviceId": { "anyOf": [{ "maxLength": 200, "minLength": 1, "type": "string" }, { "type": "null" }], "default": null, "title": "Deviceid" }, "group": { "default": "daily", "enum": ["daily", "specialized"], "title": "Group", "type": "string" }, "budgets": { "anyOf": [{ "$ref": "#/$defs/Budgets" }, { "type": "null" }], "default": null }, "tasks": { "items": { "$ref": "#/$defs/Task" }, "maxItems": 30, "minItems": 1, "title": "Tasks", "type": "array" }, "schedule": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Schedule" }, "enabled": { "default": true, "title": "Enabled", "type": "boolean" } }, "required": ["id", "name", "description", "deviceId", "group", "budgets", "tasks", "schedule", "enabled"], "title": "Plan", "type": "object" };
var schema15 = { "additionalProperties": false, "properties": { "type": { "enum": ["StartUp", "CloseDown", "Fight", "Recruit", "Infrast", "Mall", "Award", "SwitchTheme", "Roguelike", "Copilot", "SSSCopilot", "ParadoxCopilot", "Depot", "OperBox", "Reclamation", "Custom", "SingleStep", "VideoRecognition", "OperProgress"], "title": "Type", "type": "string" }, "params": { "additionalProperties": true, "title": "Params", "type": "object" }, "enabled": { "default": true, "title": "Enabled", "type": "boolean" } }, "required": ["type", "params", "enabled"], "title": "Task", "type": "object" };
var func3 = Object.prototype.hasOwnProperty;
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
      if (!func3.call(schema13.properties, key0)) {
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
        if (func2(data1) > 80) {
          const err11 = { instancePath: instancePath + "/name", schemaPath: "#/properties/name/maxLength", keyword: "maxLength", params: { limit: 80 }, message: "must NOT have more than 80 characters" };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
        if (func2(data1) < 1) {
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
        if (func2(data2) > 500) {
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
        if (func2(data3) > 200) {
          const err16 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/anyOf/0/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
        if (func2(data3) < 1) {
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
        const err22 = { instancePath: instancePath + "/group", schemaPath: "#/properties/group/enum", keyword: "enum", params: { allowedValues: schema13.properties.group.enum }, message: "must be equal to one of the allowed values" };
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
              if (!(data11 === "StartUp" || data11 === "CloseDown" || data11 === "Fight" || data11 === "Recruit" || data11 === "Infrast" || data11 === "Mall" || data11 === "Award" || data11 === "SwitchTheme" || data11 === "Roguelike" || data11 === "Copilot" || data11 === "SSSCopilot" || data11 === "ParadoxCopilot" || data11 === "Depot" || data11 === "OperBox" || data11 === "Reclamation" || data11 === "Custom" || data11 === "SingleStep" || data11 === "VideoRecognition" || data11 === "OperProgress")) {
                const err46 = { instancePath: instancePath + "/tasks/" + i0 + "/type", schemaPath: "#/$defs/Task/properties/type/enum", keyword: "enum", params: { allowedValues: schema15.properties.type.enum }, message: "must be equal to one of the allowed values" };
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
  validate11.errors = vErrors;
  return errors === 0;
}
var schema18 = { "additionalProperties": false, "properties": { "capture": { "$ref": "#/$defs/CaptureSettings" }, "autoConnect": { "default": true, "title": "Autoconnect", "type": "boolean" }, "autoUpdateCore": { "default": true, "title": "Autoupdatecore", "type": "boolean" }, "autoUpdateResource": { "default": true, "title": "Autoupdateresource", "type": "boolean" }, "minimizeToTray": { "default": true, "title": "Minimizetotray", "type": "boolean" }, "theme": { "default": "system", "enum": ["dark", "light", "system"], "title": "Theme", "type": "string" }, "budgets": { "$ref": "#/$defs/Budgets" }, "model": { "$ref": "#/$defs/ModelSettings" } }, "required": ["autoConnect", "autoUpdateCore", "autoUpdateResource", "minimizeToTray", "theme", "budgets", "model"], "title": "Settings", "type": "object" };
var schema19 = { "type": "object", "additionalProperties": false, "properties": { "method": { "type": "string", "enum": ["adb", "mumu", "ldplayer"], "default": "adb" }, "emulatorPath": { "type": "string", "maxLength": 4096, "default": "" }, "instanceIndex": { "type": "integer", "minimum": 0, "maximum": 65535, "default": 0 } }, "required": ["method", "emulatorPath", "instanceIndex"] };
function validate13(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
      if (!(key0 === "capture" || key0 === "autoConnect" || key0 === "autoUpdateCore" || key0 === "autoUpdateResource" || key0 === "minimizeToTray" || key0 === "theme" || key0 === "budgets" || key0 === "model")) {
        const err7 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.capture !== void 0) {
      let data0 = data.capture;
      if (data0 && typeof data0 == "object" && !Array.isArray(data0)) {
        if (data0.method === void 0) {
          const err8 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/CaptureSettings/required", keyword: "required", params: { missingProperty: "method" }, message: "must have required property 'method'" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        if (data0.emulatorPath === void 0) {
          const err9 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/CaptureSettings/required", keyword: "required", params: { missingProperty: "emulatorPath" }, message: "must have required property 'emulatorPath'" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
        if (data0.instanceIndex === void 0) {
          const err10 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/CaptureSettings/required", keyword: "required", params: { missingProperty: "instanceIndex" }, message: "must have required property 'instanceIndex'" };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
        for (const key1 in data0) {
          if (!(key1 === "method" || key1 === "emulatorPath" || key1 === "instanceIndex")) {
            const err11 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/CaptureSettings/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data0.method !== void 0) {
          let data1 = data0.method;
          if (typeof data1 !== "string") {
            const err12 = { instancePath: instancePath + "/capture/method", schemaPath: "#/$defs/CaptureSettings/properties/method/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
          if (!(data1 === "adb" || data1 === "mumu" || data1 === "ldplayer")) {
            const err13 = { instancePath: instancePath + "/capture/method", schemaPath: "#/$defs/CaptureSettings/properties/method/enum", keyword: "enum", params: { allowedValues: schema19.properties.method.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data0.emulatorPath !== void 0) {
          let data2 = data0.emulatorPath;
          if (typeof data2 === "string") {
            if (func2(data2) > 4096) {
              const err14 = { instancePath: instancePath + "/capture/emulatorPath", schemaPath: "#/$defs/CaptureSettings/properties/emulatorPath/maxLength", keyword: "maxLength", params: { limit: 4096 }, message: "must NOT have more than 4096 characters" };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
          } else {
            const err15 = { instancePath: instancePath + "/capture/emulatorPath", schemaPath: "#/$defs/CaptureSettings/properties/emulatorPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
        if (data0.instanceIndex !== void 0) {
          let data3 = data0.instanceIndex;
          if (!(typeof data3 == "number" && (!(data3 % 1) && !isNaN(data3)) && isFinite(data3))) {
            const err16 = { instancePath: instancePath + "/capture/instanceIndex", schemaPath: "#/$defs/CaptureSettings/properties/instanceIndex/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
          if (typeof data3 == "number" && isFinite(data3)) {
            if (data3 > 65535 || isNaN(data3)) {
              const err17 = { instancePath: instancePath + "/capture/instanceIndex", schemaPath: "#/$defs/CaptureSettings/properties/instanceIndex/maximum", keyword: "maximum", params: { comparison: "<=", limit: 65535 }, message: "must be <= 65535" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
            if (data3 < 0 || isNaN(data3)) {
              const err18 = { instancePath: instancePath + "/capture/instanceIndex", schemaPath: "#/$defs/CaptureSettings/properties/instanceIndex/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
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
        const err19 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/CaptureSettings/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
    }
    if (data.autoConnect !== void 0) {
      if (typeof data.autoConnect !== "boolean") {
        const err20 = { instancePath: instancePath + "/autoConnect", schemaPath: "#/properties/autoConnect/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
    }
    if (data.autoUpdateCore !== void 0) {
      if (typeof data.autoUpdateCore !== "boolean") {
        const err21 = { instancePath: instancePath + "/autoUpdateCore", schemaPath: "#/properties/autoUpdateCore/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
        }
        errors++;
      }
    }
    if (data.autoUpdateResource !== void 0) {
      if (typeof data.autoUpdateResource !== "boolean") {
        const err22 = { instancePath: instancePath + "/autoUpdateResource", schemaPath: "#/properties/autoUpdateResource/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
    }
    if (data.minimizeToTray !== void 0) {
      if (typeof data.minimizeToTray !== "boolean") {
        const err23 = { instancePath: instancePath + "/minimizeToTray", schemaPath: "#/properties/minimizeToTray/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
        }
        errors++;
      }
    }
    if (data.theme !== void 0) {
      let data8 = data.theme;
      if (typeof data8 !== "string") {
        const err24 = { instancePath: instancePath + "/theme", schemaPath: "#/properties/theme/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
      if (!(data8 === "dark" || data8 === "light" || data8 === "system")) {
        const err25 = { instancePath: instancePath + "/theme", schemaPath: "#/properties/theme/enum", keyword: "enum", params: { allowedValues: schema18.properties.theme.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
    }
    if (data.budgets !== void 0) {
      let data9 = data.budgets;
      if (data9 && typeof data9 == "object" && !Array.isArray(data9)) {
        if (data9.originium === void 0) {
          const err26 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/required", keyword: "required", params: { missingProperty: "originium" }, message: "must have required property 'originium'" };
          if (vErrors === null) {
            vErrors = [err26];
          } else {
            vErrors.push(err26);
          }
          errors++;
        }
        if (data9.medicine === void 0) {
          const err27 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/required", keyword: "required", params: { missingProperty: "medicine" }, message: "must have required property 'medicine'" };
          if (vErrors === null) {
            vErrors = [err27];
          } else {
            vErrors.push(err27);
          }
          errors++;
        }
        if (data9.expedited === void 0) {
          const err28 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/required", keyword: "required", params: { missingProperty: "expedited" }, message: "must have required property 'expedited'" };
          if (vErrors === null) {
            vErrors = [err28];
          } else {
            vErrors.push(err28);
          }
          errors++;
        }
        for (const key2 in data9) {
          if (!(key2 === "originium" || key2 === "medicine" || key2 === "expedited")) {
            const err29 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err29];
            } else {
              vErrors.push(err29);
            }
            errors++;
          }
        }
        if (data9.originium !== void 0) {
          let data10 = data9.originium;
          if (!(typeof data10 == "number" && (!(data10 % 1) && !isNaN(data10)) && isFinite(data10))) {
            const err30 = { instancePath: instancePath + "/budgets/originium", schemaPath: "#/$defs/Budgets/properties/originium/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err30];
            } else {
              vErrors.push(err30);
            }
            errors++;
          }
          if (typeof data10 == "number" && isFinite(data10)) {
            if (data10 > 100 || isNaN(data10)) {
              const err31 = { instancePath: instancePath + "/budgets/originium", schemaPath: "#/$defs/Budgets/properties/originium/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
              if (vErrors === null) {
                vErrors = [err31];
              } else {
                vErrors.push(err31);
              }
              errors++;
            }
            if (data10 < 0 || isNaN(data10)) {
              const err32 = { instancePath: instancePath + "/budgets/originium", schemaPath: "#/$defs/Budgets/properties/originium/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err32];
              } else {
                vErrors.push(err32);
              }
              errors++;
            }
          }
        }
        if (data9.medicine !== void 0) {
          let data11 = data9.medicine;
          if (!(typeof data11 == "number" && (!(data11 % 1) && !isNaN(data11)) && isFinite(data11))) {
            const err33 = { instancePath: instancePath + "/budgets/medicine", schemaPath: "#/$defs/Budgets/properties/medicine/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err33];
            } else {
              vErrors.push(err33);
            }
            errors++;
          }
          if (typeof data11 == "number" && isFinite(data11)) {
            if (data11 > 100 || isNaN(data11)) {
              const err34 = { instancePath: instancePath + "/budgets/medicine", schemaPath: "#/$defs/Budgets/properties/medicine/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
              if (vErrors === null) {
                vErrors = [err34];
              } else {
                vErrors.push(err34);
              }
              errors++;
            }
            if (data11 < 0 || isNaN(data11)) {
              const err35 = { instancePath: instancePath + "/budgets/medicine", schemaPath: "#/$defs/Budgets/properties/medicine/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err35];
              } else {
                vErrors.push(err35);
              }
              errors++;
            }
          }
        }
        if (data9.expedited !== void 0) {
          let data12 = data9.expedited;
          if (!(typeof data12 == "number" && (!(data12 % 1) && !isNaN(data12)) && isFinite(data12))) {
            const err36 = { instancePath: instancePath + "/budgets/expedited", schemaPath: "#/$defs/Budgets/properties/expedited/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err36];
            } else {
              vErrors.push(err36);
            }
            errors++;
          }
          if (typeof data12 == "number" && isFinite(data12)) {
            if (data12 > 100 || isNaN(data12)) {
              const err37 = { instancePath: instancePath + "/budgets/expedited", schemaPath: "#/$defs/Budgets/properties/expedited/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
              if (vErrors === null) {
                vErrors = [err37];
              } else {
                vErrors.push(err37);
              }
              errors++;
            }
            if (data12 < 0 || isNaN(data12)) {
              const err38 = { instancePath: instancePath + "/budgets/expedited", schemaPath: "#/$defs/Budgets/properties/expedited/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err38];
              } else {
                vErrors.push(err38);
              }
              errors++;
            }
          }
        }
      } else {
        const err39 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err39];
        } else {
          vErrors.push(err39);
        }
        errors++;
      }
    }
    if (data.model !== void 0) {
      let data13 = data.model;
      if (data13 && typeof data13 == "object" && !Array.isArray(data13)) {
        if (data13.provider === void 0) {
          const err40 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/required", keyword: "required", params: { missingProperty: "provider" }, message: "must have required property 'provider'" };
          if (vErrors === null) {
            vErrors = [err40];
          } else {
            vErrors.push(err40);
          }
          errors++;
        }
        if (data13.baseUrl === void 0) {
          const err41 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/required", keyword: "required", params: { missingProperty: "baseUrl" }, message: "must have required property 'baseUrl'" };
          if (vErrors === null) {
            vErrors = [err41];
          } else {
            vErrors.push(err41);
          }
          errors++;
        }
        if (data13.model === void 0) {
          const err42 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/required", keyword: "required", params: { missingProperty: "model" }, message: "must have required property 'model'" };
          if (vErrors === null) {
            vErrors = [err42];
          } else {
            vErrors.push(err42);
          }
          errors++;
        }
        for (const key3 in data13) {
          if (!(key3 === "provider" || key3 === "baseUrl" || key3 === "model")) {
            const err43 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err43];
            } else {
              vErrors.push(err43);
            }
            errors++;
          }
        }
        if (data13.provider !== void 0) {
          if (typeof data13.provider !== "string") {
            const err44 = { instancePath: instancePath + "/model/provider", schemaPath: "#/$defs/ModelSettings/properties/provider/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err44];
            } else {
              vErrors.push(err44);
            }
            errors++;
          }
        }
        if (data13.baseUrl !== void 0) {
          if (typeof data13.baseUrl !== "string") {
            const err45 = { instancePath: instancePath + "/model/baseUrl", schemaPath: "#/$defs/ModelSettings/properties/baseUrl/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err45];
            } else {
              vErrors.push(err45);
            }
            errors++;
          }
        }
        if (data13.model !== void 0) {
          if (typeof data13.model !== "string") {
            const err46 = { instancePath: instancePath + "/model/model", schemaPath: "#/$defs/ModelSettings/properties/model/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err46];
            } else {
              vErrors.push(err46);
            }
            errors++;
          }
        }
      } else {
        const err47 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err47];
        } else {
          vErrors.push(err47);
        }
        errors++;
      }
    }
  } else {
    const err48 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err48];
    } else {
      vErrors.push(err48);
    }
    errors++;
  }
  validate13.errors = vErrors;
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
          let data2 = data1[i0];
          if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
            if (data2.id === void 0) {
              const err10 = { instancePath: instancePath + "/devices/" + i0, schemaPath: "#/$defs/Device/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
            if (data2.name === void 0) {
              const err11 = { instancePath: instancePath + "/devices/" + i0, schemaPath: "#/$defs/Device/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
            if (data2.address === void 0) {
              const err12 = { instancePath: instancePath + "/devices/" + i0, schemaPath: "#/$defs/Device/required", keyword: "required", params: { missingProperty: "address" }, message: "must have required property 'address'" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
            if (data2.state === void 0) {
              const err13 = { instancePath: instancePath + "/devices/" + i0, schemaPath: "#/$defs/Device/required", keyword: "required", params: { missingProperty: "state" }, message: "must have required property 'state'" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
            if (data2.coreVersion === void 0) {
              const err14 = { instancePath: instancePath + "/devices/" + i0, schemaPath: "#/$defs/Device/required", keyword: "required", params: { missingProperty: "coreVersion" }, message: "must have required property 'coreVersion'" };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
            if (data2.resourceVersion === void 0) {
              const err15 = { instancePath: instancePath + "/devices/" + i0, schemaPath: "#/$defs/Device/required", keyword: "required", params: { missingProperty: "resourceVersion" }, message: "must have required property 'resourceVersion'" };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
            for (const key1 in data2) {
              if (!(key1 === "id" || key1 === "name" || key1 === "address" || key1 === "state" || key1 === "coreVersion" || key1 === "captureMethod" || key1 === "resourceVersion")) {
                const err16 = { instancePath: instancePath + "/devices/" + i0, schemaPath: "#/$defs/Device/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
            }
            if (data2.id !== void 0) {
              if (typeof data2.id !== "string") {
                const err17 = { instancePath: instancePath + "/devices/" + i0 + "/id", schemaPath: "#/$defs/Device/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
            }
            if (data2.name !== void 0) {
              if (typeof data2.name !== "string") {
                const err18 = { instancePath: instancePath + "/devices/" + i0 + "/name", schemaPath: "#/$defs/Device/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
            }
            if (data2.address !== void 0) {
              if (typeof data2.address !== "string") {
                const err19 = { instancePath: instancePath + "/devices/" + i0 + "/address", schemaPath: "#/$defs/Device/properties/address/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
              }
            }
            if (data2.state !== void 0) {
              let data6 = data2.state;
              if (typeof data6 !== "string") {
                const err20 = { instancePath: instancePath + "/devices/" + i0 + "/state", schemaPath: "#/$defs/Device/properties/state/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
              if (!(data6 === "idle" || data6 === "running" || data6 === "offline")) {
                const err21 = { instancePath: instancePath + "/devices/" + i0 + "/state", schemaPath: "#/$defs/Device/properties/state/enum", keyword: "enum", params: { allowedValues: schema12.properties.state.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err21];
                } else {
                  vErrors.push(err21);
                }
                errors++;
              }
            }
            if (data2.coreVersion !== void 0) {
              let data7 = data2.coreVersion;
              const _errs20 = errors;
              let valid5 = false;
              const _errs21 = errors;
              if (typeof data7 !== "string") {
                const err22 = { instancePath: instancePath + "/devices/" + i0 + "/coreVersion", schemaPath: "#/$defs/Device/properties/coreVersion/anyOf/0/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err22];
                } else {
                  vErrors.push(err22);
                }
                errors++;
              }
              var _valid0 = _errs21 === errors;
              valid5 = valid5 || _valid0;
              if (!valid5) {
                const _errs23 = errors;
                if (data7 !== null) {
                  const err23 = { instancePath: instancePath + "/devices/" + i0 + "/coreVersion", schemaPath: "#/$defs/Device/properties/coreVersion/anyOf/1/type", keyword: "type", params: { type: "null" }, message: "must be null" };
                  if (vErrors === null) {
                    vErrors = [err23];
                  } else {
                    vErrors.push(err23);
                  }
                  errors++;
                }
                var _valid0 = _errs23 === errors;
                valid5 = valid5 || _valid0;
              }
              if (!valid5) {
                const err24 = { instancePath: instancePath + "/devices/" + i0 + "/coreVersion", schemaPath: "#/$defs/Device/properties/coreVersion/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                if (vErrors === null) {
                  vErrors = [err24];
                } else {
                  vErrors.push(err24);
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
            if (data2.captureMethod !== void 0) {
              let data8 = data2.captureMethod;
              if (typeof data8 === "string") {
                if (func2(data8) > 128) {
                  const err25 = { instancePath: instancePath + "/devices/" + i0 + "/captureMethod", schemaPath: "#/$defs/Device/properties/captureMethod/maxLength", keyword: "maxLength", params: { limit: 128 }, message: "must NOT have more than 128 characters" };
                  if (vErrors === null) {
                    vErrors = [err25];
                  } else {
                    vErrors.push(err25);
                  }
                  errors++;
                }
              } else {
                const err26 = { instancePath: instancePath + "/devices/" + i0 + "/captureMethod", schemaPath: "#/$defs/Device/properties/captureMethod/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err26];
                } else {
                  vErrors.push(err26);
                }
                errors++;
              }
            }
            if (data2.resourceVersion !== void 0) {
              let data9 = data2.resourceVersion;
              const _errs28 = errors;
              let valid6 = false;
              const _errs29 = errors;
              if (typeof data9 !== "string") {
                const err27 = { instancePath: instancePath + "/devices/" + i0 + "/resourceVersion", schemaPath: "#/$defs/Device/properties/resourceVersion/anyOf/0/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err27];
                } else {
                  vErrors.push(err27);
                }
                errors++;
              }
              var _valid1 = _errs29 === errors;
              valid6 = valid6 || _valid1;
              if (!valid6) {
                const _errs31 = errors;
                if (data9 !== null) {
                  const err28 = { instancePath: instancePath + "/devices/" + i0 + "/resourceVersion", schemaPath: "#/$defs/Device/properties/resourceVersion/anyOf/1/type", keyword: "type", params: { type: "null" }, message: "must be null" };
                  if (vErrors === null) {
                    vErrors = [err28];
                  } else {
                    vErrors.push(err28);
                  }
                  errors++;
                }
                var _valid1 = _errs31 === errors;
                valid6 = valid6 || _valid1;
              }
              if (!valid6) {
                const err29 = { instancePath: instancePath + "/devices/" + i0 + "/resourceVersion", schemaPath: "#/$defs/Device/properties/resourceVersion/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                if (vErrors === null) {
                  vErrors = [err29];
                } else {
                  vErrors.push(err29);
                }
                errors++;
              } else {
                errors = _errs28;
                if (vErrors !== null) {
                  if (_errs28) {
                    vErrors.length = _errs28;
                  } else {
                    vErrors = null;
                  }
                }
              }
            }
          } else {
            const err30 = { instancePath: instancePath + "/devices/" + i0, schemaPath: "#/$defs/Device/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err30];
            } else {
              vErrors.push(err30);
            }
            errors++;
          }
        }
      } else {
        const err31 = { instancePath: instancePath + "/devices", schemaPath: "#/properties/devices/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err31];
        } else {
          vErrors.push(err31);
        }
        errors++;
      }
    }
    if (data.plans !== void 0) {
      let data10 = data.plans;
      if (Array.isArray(data10)) {
        const len1 = data10.length;
        for (let i1 = 0; i1 < len1; i1++) {
          if (!validate11(data10[i1], { instancePath: instancePath + "/plans/" + i1, parentData: data10, parentDataProperty: i1, rootData })) {
            vErrors = vErrors === null ? validate11.errors : vErrors.concat(validate11.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err32 = { instancePath: instancePath + "/plans", schemaPath: "#/properties/plans/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err32];
        } else {
          vErrors.push(err32);
        }
        errors++;
      }
    }
    if (data.runs !== void 0) {
      let data12 = data.runs;
      if (Array.isArray(data12)) {
        const len2 = data12.length;
        for (let i2 = 0; i2 < len2; i2++) {
          let data13 = data12[i2];
          if (data13 && typeof data13 == "object" && !Array.isArray(data13)) {
            if (data13.id === void 0) {
              const err33 = { instancePath: instancePath + "/runs/" + i2, schemaPath: "#/$defs/Run/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
              if (vErrors === null) {
                vErrors = [err33];
              } else {
                vErrors.push(err33);
              }
              errors++;
            }
            if (data13.planId === void 0) {
              const err34 = { instancePath: instancePath + "/runs/" + i2, schemaPath: "#/$defs/Run/required", keyword: "required", params: { missingProperty: "planId" }, message: "must have required property 'planId'" };
              if (vErrors === null) {
                vErrors = [err34];
              } else {
                vErrors.push(err34);
              }
              errors++;
            }
            if (data13.deviceId === void 0) {
              const err35 = { instancePath: instancePath + "/runs/" + i2, schemaPath: "#/$defs/Run/required", keyword: "required", params: { missingProperty: "deviceId" }, message: "must have required property 'deviceId'" };
              if (vErrors === null) {
                vErrors = [err35];
              } else {
                vErrors.push(err35);
              }
              errors++;
            }
            if (data13.status === void 0) {
              const err36 = { instancePath: instancePath + "/runs/" + i2, schemaPath: "#/$defs/Run/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
              if (vErrors === null) {
                vErrors = [err36];
              } else {
                vErrors.push(err36);
              }
              errors++;
            }
            if (data13.progress === void 0) {
              const err37 = { instancePath: instancePath + "/runs/" + i2, schemaPath: "#/$defs/Run/required", keyword: "required", params: { missingProperty: "progress" }, message: "must have required property 'progress'" };
              if (vErrors === null) {
                vErrors = [err37];
              } else {
                vErrors.push(err37);
              }
              errors++;
            }
            if (data13.message === void 0) {
              const err38 = { instancePath: instancePath + "/runs/" + i2, schemaPath: "#/$defs/Run/required", keyword: "required", params: { missingProperty: "message" }, message: "must have required property 'message'" };
              if (vErrors === null) {
                vErrors = [err38];
              } else {
                vErrors.push(err38);
              }
              errors++;
            }
            if (data13.startedAt === void 0) {
              const err39 = { instancePath: instancePath + "/runs/" + i2, schemaPath: "#/$defs/Run/required", keyword: "required", params: { missingProperty: "startedAt" }, message: "must have required property 'startedAt'" };
              if (vErrors === null) {
                vErrors = [err39];
              } else {
                vErrors.push(err39);
              }
              errors++;
            }
            if (data13.finishedAt === void 0) {
              const err40 = { instancePath: instancePath + "/runs/" + i2, schemaPath: "#/$defs/Run/required", keyword: "required", params: { missingProperty: "finishedAt" }, message: "must have required property 'finishedAt'" };
              if (vErrors === null) {
                vErrors = [err40];
              } else {
                vErrors.push(err40);
              }
              errors++;
            }
            for (const key2 in data13) {
              if (!(key2 === "id" || key2 === "planId" || key2 === "deviceId" || key2 === "status" || key2 === "progress" || key2 === "message" || key2 === "startedAt" || key2 === "finishedAt")) {
                const err41 = { instancePath: instancePath + "/runs/" + i2, schemaPath: "#/$defs/Run/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err41];
                } else {
                  vErrors.push(err41);
                }
                errors++;
              }
            }
            if (data13.id !== void 0) {
              if (typeof data13.id !== "string") {
                const err42 = { instancePath: instancePath + "/runs/" + i2 + "/id", schemaPath: "#/$defs/Run/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err42];
                } else {
                  vErrors.push(err42);
                }
                errors++;
              }
            }
            if (data13.planId !== void 0) {
              if (typeof data13.planId !== "string") {
                const err43 = { instancePath: instancePath + "/runs/" + i2 + "/planId", schemaPath: "#/$defs/Run/properties/planId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err43];
                } else {
                  vErrors.push(err43);
                }
                errors++;
              }
            }
            if (data13.deviceId !== void 0) {
              if (typeof data13.deviceId !== "string") {
                const err44 = { instancePath: instancePath + "/runs/" + i2 + "/deviceId", schemaPath: "#/$defs/Run/properties/deviceId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err44];
                } else {
                  vErrors.push(err44);
                }
                errors++;
              }
            }
            if (data13.status !== void 0) {
              let data17 = data13.status;
              if (typeof data17 !== "string") {
                const err45 = { instancePath: instancePath + "/runs/" + i2 + "/status", schemaPath: "#/$defs/Run/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err45];
                } else {
                  vErrors.push(err45);
                }
                errors++;
              }
              if (!(data17 === "running" || data17 === "completed" || data17 === "failed" || data17 === "stopped")) {
                const err46 = { instancePath: instancePath + "/runs/" + i2 + "/status", schemaPath: "#/$defs/Run/properties/status/enum", keyword: "enum", params: { allowedValues: schema16.properties.status.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err46];
                } else {
                  vErrors.push(err46);
                }
                errors++;
              }
            }
            if (data13.progress !== void 0) {
              let data18 = data13.progress;
              if (!(typeof data18 == "number" && (!(data18 % 1) && !isNaN(data18)) && isFinite(data18))) {
                const err47 = { instancePath: instancePath + "/runs/" + i2 + "/progress", schemaPath: "#/$defs/Run/properties/progress/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err47];
                } else {
                  vErrors.push(err47);
                }
                errors++;
              }
              if (typeof data18 == "number" && isFinite(data18)) {
                if (data18 > 100 || isNaN(data18)) {
                  const err48 = { instancePath: instancePath + "/runs/" + i2 + "/progress", schemaPath: "#/$defs/Run/properties/progress/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
                  if (vErrors === null) {
                    vErrors = [err48];
                  } else {
                    vErrors.push(err48);
                  }
                  errors++;
                }
                if (data18 < 0 || isNaN(data18)) {
                  const err49 = { instancePath: instancePath + "/runs/" + i2 + "/progress", schemaPath: "#/$defs/Run/properties/progress/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err49];
                  } else {
                    vErrors.push(err49);
                  }
                  errors++;
                }
              }
            }
            if (data13.message !== void 0) {
              if (typeof data13.message !== "string") {
                const err50 = { instancePath: instancePath + "/runs/" + i2 + "/message", schemaPath: "#/$defs/Run/properties/message/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err50];
                } else {
                  vErrors.push(err50);
                }
                errors++;
              }
            }
            if (data13.startedAt !== void 0) {
              if (typeof data13.startedAt !== "string") {
                const err51 = { instancePath: instancePath + "/runs/" + i2 + "/startedAt", schemaPath: "#/$defs/Run/properties/startedAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err51];
                } else {
                  vErrors.push(err51);
                }
                errors++;
              }
            }
            if (data13.finishedAt !== void 0) {
              let data21 = data13.finishedAt;
              const _errs57 = errors;
              let valid13 = false;
              const _errs58 = errors;
              if (typeof data21 !== "string") {
                const err52 = { instancePath: instancePath + "/runs/" + i2 + "/finishedAt", schemaPath: "#/$defs/Run/properties/finishedAt/anyOf/0/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err52];
                } else {
                  vErrors.push(err52);
                }
                errors++;
              }
              var _valid2 = _errs58 === errors;
              valid13 = valid13 || _valid2;
              if (!valid13) {
                const _errs60 = errors;
                if (data21 !== null) {
                  const err53 = { instancePath: instancePath + "/runs/" + i2 + "/finishedAt", schemaPath: "#/$defs/Run/properties/finishedAt/anyOf/1/type", keyword: "type", params: { type: "null" }, message: "must be null" };
                  if (vErrors === null) {
                    vErrors = [err53];
                  } else {
                    vErrors.push(err53);
                  }
                  errors++;
                }
                var _valid2 = _errs60 === errors;
                valid13 = valid13 || _valid2;
              }
              if (!valid13) {
                const err54 = { instancePath: instancePath + "/runs/" + i2 + "/finishedAt", schemaPath: "#/$defs/Run/properties/finishedAt/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                if (vErrors === null) {
                  vErrors = [err54];
                } else {
                  vErrors.push(err54);
                }
                errors++;
              } else {
                errors = _errs57;
                if (vErrors !== null) {
                  if (_errs57) {
                    vErrors.length = _errs57;
                  } else {
                    vErrors = null;
                  }
                }
              }
            }
          } else {
            const err55 = { instancePath: instancePath + "/runs/" + i2, schemaPath: "#/$defs/Run/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err55];
            } else {
              vErrors.push(err55);
            }
            errors++;
          }
        }
      } else {
        const err56 = { instancePath: instancePath + "/runs", schemaPath: "#/properties/runs/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err56];
        } else {
          vErrors.push(err56);
        }
        errors++;
      }
    }
    if (data.updates !== void 0) {
      let data22 = data.updates;
      if (Array.isArray(data22)) {
        const len3 = data22.length;
        for (let i3 = 0; i3 < len3; i3++) {
          let data23 = data22[i3];
          if (data23 && typeof data23 == "object" && !Array.isArray(data23)) {
            if (data23.id === void 0) {
              const err57 = { instancePath: instancePath + "/updates/" + i3, schemaPath: "#/$defs/UpdateChannel/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
              if (vErrors === null) {
                vErrors = [err57];
              } else {
                vErrors.push(err57);
              }
              errors++;
            }
            if (data23.currentVersion === void 0) {
              const err58 = { instancePath: instancePath + "/updates/" + i3, schemaPath: "#/$defs/UpdateChannel/required", keyword: "required", params: { missingProperty: "currentVersion" }, message: "must have required property 'currentVersion'" };
              if (vErrors === null) {
                vErrors = [err58];
              } else {
                vErrors.push(err58);
              }
              errors++;
            }
            if (data23.latestVersion === void 0) {
              const err59 = { instancePath: instancePath + "/updates/" + i3, schemaPath: "#/$defs/UpdateChannel/required", keyword: "required", params: { missingProperty: "latestVersion" }, message: "must have required property 'latestVersion'" };
              if (vErrors === null) {
                vErrors = [err59];
              } else {
                vErrors.push(err59);
              }
              errors++;
            }
            if (data23.status === void 0) {
              const err60 = { instancePath: instancePath + "/updates/" + i3, schemaPath: "#/$defs/UpdateChannel/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
              if (vErrors === null) {
                vErrors = [err60];
              } else {
                vErrors.push(err60);
              }
              errors++;
            }
            if (data23.progress === void 0) {
              const err61 = { instancePath: instancePath + "/updates/" + i3, schemaPath: "#/$defs/UpdateChannel/required", keyword: "required", params: { missingProperty: "progress" }, message: "must have required property 'progress'" };
              if (vErrors === null) {
                vErrors = [err61];
              } else {
                vErrors.push(err61);
              }
              errors++;
            }
            if (data23.message === void 0) {
              const err62 = { instancePath: instancePath + "/updates/" + i3, schemaPath: "#/$defs/UpdateChannel/required", keyword: "required", params: { missingProperty: "message" }, message: "must have required property 'message'" };
              if (vErrors === null) {
                vErrors = [err62];
              } else {
                vErrors.push(err62);
              }
              errors++;
            }
            for (const key3 in data23) {
              if (!(key3 === "id" || key3 === "currentVersion" || key3 === "latestVersion" || key3 === "status" || key3 === "progress" || key3 === "message")) {
                const err63 = { instancePath: instancePath + "/updates/" + i3, schemaPath: "#/$defs/UpdateChannel/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err63];
                } else {
                  vErrors.push(err63);
                }
                errors++;
              }
            }
            if (data23.id !== void 0) {
              let data24 = data23.id;
              if (typeof data24 !== "string") {
                const err64 = { instancePath: instancePath + "/updates/" + i3 + "/id", schemaPath: "#/$defs/UpdateChannel/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err64];
                } else {
                  vErrors.push(err64);
                }
                errors++;
              }
              if (!(data24 === "app" || data24 === "core" || data24 === "resource")) {
                const err65 = { instancePath: instancePath + "/updates/" + i3 + "/id", schemaPath: "#/$defs/UpdateChannel/properties/id/enum", keyword: "enum", params: { allowedValues: schema17.properties.id.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err65];
                } else {
                  vErrors.push(err65);
                }
                errors++;
              }
            }
            if (data23.currentVersion !== void 0) {
              if (typeof data23.currentVersion !== "string") {
                const err66 = { instancePath: instancePath + "/updates/" + i3 + "/currentVersion", schemaPath: "#/$defs/UpdateChannel/properties/currentVersion/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err66];
                } else {
                  vErrors.push(err66);
                }
                errors++;
              }
            }
            if (data23.latestVersion !== void 0) {
              let data26 = data23.latestVersion;
              const _errs73 = errors;
              let valid18 = false;
              const _errs74 = errors;
              if (typeof data26 !== "string") {
                const err67 = { instancePath: instancePath + "/updates/" + i3 + "/latestVersion", schemaPath: "#/$defs/UpdateChannel/properties/latestVersion/anyOf/0/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err67];
                } else {
                  vErrors.push(err67);
                }
                errors++;
              }
              var _valid3 = _errs74 === errors;
              valid18 = valid18 || _valid3;
              if (!valid18) {
                const _errs76 = errors;
                if (data26 !== null) {
                  const err68 = { instancePath: instancePath + "/updates/" + i3 + "/latestVersion", schemaPath: "#/$defs/UpdateChannel/properties/latestVersion/anyOf/1/type", keyword: "type", params: { type: "null" }, message: "must be null" };
                  if (vErrors === null) {
                    vErrors = [err68];
                  } else {
                    vErrors.push(err68);
                  }
                  errors++;
                }
                var _valid3 = _errs76 === errors;
                valid18 = valid18 || _valid3;
              }
              if (!valid18) {
                const err69 = { instancePath: instancePath + "/updates/" + i3 + "/latestVersion", schemaPath: "#/$defs/UpdateChannel/properties/latestVersion/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                if (vErrors === null) {
                  vErrors = [err69];
                } else {
                  vErrors.push(err69);
                }
                errors++;
              } else {
                errors = _errs73;
                if (vErrors !== null) {
                  if (_errs73) {
                    vErrors.length = _errs73;
                  } else {
                    vErrors = null;
                  }
                }
              }
            }
            if (data23.status !== void 0) {
              let data27 = data23.status;
              if (typeof data27 !== "string") {
                const err70 = { instancePath: instancePath + "/updates/" + i3 + "/status", schemaPath: "#/$defs/UpdateChannel/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err70];
                } else {
                  vErrors.push(err70);
                }
                errors++;
              }
              if (!(data27 === "idle" || data27 === "checking" || data27 === "available" || data27 === "downloading" || data27 === "staged" || data27 === "waiting_idle" || data27 === "active" || data27 === "failed")) {
                const err71 = { instancePath: instancePath + "/updates/" + i3 + "/status", schemaPath: "#/$defs/UpdateChannel/properties/status/enum", keyword: "enum", params: { allowedValues: schema17.properties.status.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err71];
                } else {
                  vErrors.push(err71);
                }
                errors++;
              }
            }
            if (data23.progress !== void 0) {
              let data28 = data23.progress;
              if (!(typeof data28 == "number" && (!(data28 % 1) && !isNaN(data28)) && isFinite(data28))) {
                const err72 = { instancePath: instancePath + "/updates/" + i3 + "/progress", schemaPath: "#/$defs/UpdateChannel/properties/progress/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err72];
                } else {
                  vErrors.push(err72);
                }
                errors++;
              }
              if (typeof data28 == "number" && isFinite(data28)) {
                if (data28 > 100 || isNaN(data28)) {
                  const err73 = { instancePath: instancePath + "/updates/" + i3 + "/progress", schemaPath: "#/$defs/UpdateChannel/properties/progress/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
                  if (vErrors === null) {
                    vErrors = [err73];
                  } else {
                    vErrors.push(err73);
                  }
                  errors++;
                }
                if (data28 < 0 || isNaN(data28)) {
                  const err74 = { instancePath: instancePath + "/updates/" + i3 + "/progress", schemaPath: "#/$defs/UpdateChannel/properties/progress/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err74];
                  } else {
                    vErrors.push(err74);
                  }
                  errors++;
                }
              }
            }
            if (data23.message !== void 0) {
              if (typeof data23.message !== "string") {
                const err75 = { instancePath: instancePath + "/updates/" + i3 + "/message", schemaPath: "#/$defs/UpdateChannel/properties/message/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err75];
                } else {
                  vErrors.push(err75);
                }
                errors++;
              }
            }
          } else {
            const err76 = { instancePath: instancePath + "/updates/" + i3, schemaPath: "#/$defs/UpdateChannel/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err76];
            } else {
              vErrors.push(err76);
            }
            errors++;
          }
        }
      } else {
        const err77 = { instancePath: instancePath + "/updates", schemaPath: "#/properties/updates/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err77];
        } else {
          vErrors.push(err77);
        }
        errors++;
      }
    }
    if (data.settings !== void 0) {
      if (!validate13(data.settings, { instancePath: instancePath + "/settings", parentData: data, parentDataProperty: "settings", rootData })) {
        vErrors = vErrors === null ? validate13.errors : vErrors.concat(validate13.errors);
        errors = vErrors.length;
      }
    }
    if (data.events !== void 0) {
      let data31 = data.events;
      if (Array.isArray(data31)) {
        const len4 = data31.length;
        for (let i4 = 0; i4 < len4; i4++) {
          let data32 = data31[i4];
          if (data32 && typeof data32 == "object" && !Array.isArray(data32)) {
            if (data32.id === void 0) {
              const err78 = { instancePath: instancePath + "/events/" + i4, schemaPath: "#/$defs/Event/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
              if (vErrors === null) {
                vErrors = [err78];
              } else {
                vErrors.push(err78);
              }
              errors++;
            }
            if (data32.type === void 0) {
              const err79 = { instancePath: instancePath + "/events/" + i4, schemaPath: "#/$defs/Event/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
              if (vErrors === null) {
                vErrors = [err79];
              } else {
                vErrors.push(err79);
              }
              errors++;
            }
            if (data32.message === void 0) {
              const err80 = { instancePath: instancePath + "/events/" + i4, schemaPath: "#/$defs/Event/required", keyword: "required", params: { missingProperty: "message" }, message: "must have required property 'message'" };
              if (vErrors === null) {
                vErrors = [err80];
              } else {
                vErrors.push(err80);
              }
              errors++;
            }
            if (data32.createdAt === void 0) {
              const err81 = { instancePath: instancePath + "/events/" + i4, schemaPath: "#/$defs/Event/required", keyword: "required", params: { missingProperty: "createdAt" }, message: "must have required property 'createdAt'" };
              if (vErrors === null) {
                vErrors = [err81];
              } else {
                vErrors.push(err81);
              }
              errors++;
            }
            if (data32.data === void 0) {
              const err82 = { instancePath: instancePath + "/events/" + i4, schemaPath: "#/$defs/Event/required", keyword: "required", params: { missingProperty: "data" }, message: "must have required property 'data'" };
              if (vErrors === null) {
                vErrors = [err82];
              } else {
                vErrors.push(err82);
              }
              errors++;
            }
            for (const key4 in data32) {
              if (!(key4 === "id" || key4 === "type" || key4 === "message" || key4 === "createdAt" || key4 === "data")) {
                const err83 = { instancePath: instancePath + "/events/" + i4, schemaPath: "#/$defs/Event/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err83];
                } else {
                  vErrors.push(err83);
                }
                errors++;
              }
            }
            if (data32.id !== void 0) {
              let data33 = data32.id;
              if (!(typeof data33 == "number" && (!(data33 % 1) && !isNaN(data33)) && isFinite(data33))) {
                const err84 = { instancePath: instancePath + "/events/" + i4 + "/id", schemaPath: "#/$defs/Event/properties/id/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err84];
                } else {
                  vErrors.push(err84);
                }
                errors++;
              }
            }
            if (data32.type !== void 0) {
              if (typeof data32.type !== "string") {
                const err85 = { instancePath: instancePath + "/events/" + i4 + "/type", schemaPath: "#/$defs/Event/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err85];
                } else {
                  vErrors.push(err85);
                }
                errors++;
              }
            }
            if (data32.message !== void 0) {
              if (typeof data32.message !== "string") {
                const err86 = { instancePath: instancePath + "/events/" + i4 + "/message", schemaPath: "#/$defs/Event/properties/message/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err86];
                } else {
                  vErrors.push(err86);
                }
                errors++;
              }
            }
            if (data32.createdAt !== void 0) {
              if (typeof data32.createdAt !== "string") {
                const err87 = { instancePath: instancePath + "/events/" + i4 + "/createdAt", schemaPath: "#/$defs/Event/properties/createdAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err87];
                } else {
                  vErrors.push(err87);
                }
                errors++;
              }
            }
            if (data32.data !== void 0) {
              let data37 = data32.data;
              if (data37 && typeof data37 == "object" && !Array.isArray(data37)) {
              } else {
                const err88 = { instancePath: instancePath + "/events/" + i4 + "/data", schemaPath: "#/$defs/Event/properties/data/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err88];
                } else {
                  vErrors.push(err88);
                }
                errors++;
              }
            }
          } else {
            const err89 = { instancePath: instancePath + "/events/" + i4, schemaPath: "#/$defs/Event/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err89];
            } else {
              vErrors.push(err89);
            }
            errors++;
          }
        }
      } else {
        const err90 = { instancePath: instancePath + "/events", schemaPath: "#/properties/events/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err90];
        } else {
          vErrors.push(err90);
        }
        errors++;
      }
    }
  } else {
    const err91 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err91];
    } else {
      vErrors.push(err91);
    }
    errors++;
  }
  validate10.errors = vErrors;
  return errors === 0;
}
var validatePlan = validate15;
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
      if (!func3.call(schema13.properties, key0)) {
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
        if (func2(data1) > 80) {
          const err11 = { instancePath: instancePath + "/name", schemaPath: "#/properties/name/maxLength", keyword: "maxLength", params: { limit: 80 }, message: "must NOT have more than 80 characters" };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
        if (func2(data1) < 1) {
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
        if (func2(data2) > 500) {
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
        if (func2(data3) > 200) {
          const err16 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/anyOf/0/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
        if (func2(data3) < 1) {
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
        const err22 = { instancePath: instancePath + "/group", schemaPath: "#/properties/group/enum", keyword: "enum", params: { allowedValues: schema13.properties.group.enum }, message: "must be equal to one of the allowed values" };
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
              if (!(data11 === "StartUp" || data11 === "CloseDown" || data11 === "Fight" || data11 === "Recruit" || data11 === "Infrast" || data11 === "Mall" || data11 === "Award" || data11 === "SwitchTheme" || data11 === "Roguelike" || data11 === "Copilot" || data11 === "SSSCopilot" || data11 === "ParadoxCopilot" || data11 === "Depot" || data11 === "OperBox" || data11 === "Reclamation" || data11 === "Custom" || data11 === "SingleStep" || data11 === "VideoRecognition" || data11 === "OperProgress")) {
                const err46 = { instancePath: instancePath + "/tasks/" + i0 + "/type", schemaPath: "#/$defs/Task/properties/type/enum", keyword: "enum", params: { allowedValues: schema15.properties.type.enum }, message: "must be equal to one of the allowed values" };
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
  validate15.errors = vErrors;
  return errors === 0;
}
var validateSettings = validate16;
function validate16(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
      if (!(key0 === "capture" || key0 === "autoConnect" || key0 === "autoUpdateCore" || key0 === "autoUpdateResource" || key0 === "minimizeToTray" || key0 === "theme" || key0 === "budgets" || key0 === "model")) {
        const err7 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.capture !== void 0) {
      let data0 = data.capture;
      if (data0 && typeof data0 == "object" && !Array.isArray(data0)) {
        if (data0.method === void 0) {
          const err8 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/CaptureSettings/required", keyword: "required", params: { missingProperty: "method" }, message: "must have required property 'method'" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        if (data0.emulatorPath === void 0) {
          const err9 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/CaptureSettings/required", keyword: "required", params: { missingProperty: "emulatorPath" }, message: "must have required property 'emulatorPath'" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
        if (data0.instanceIndex === void 0) {
          const err10 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/CaptureSettings/required", keyword: "required", params: { missingProperty: "instanceIndex" }, message: "must have required property 'instanceIndex'" };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
        for (const key1 in data0) {
          if (!(key1 === "method" || key1 === "emulatorPath" || key1 === "instanceIndex")) {
            const err11 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/CaptureSettings/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data0.method !== void 0) {
          let data1 = data0.method;
          if (typeof data1 !== "string") {
            const err12 = { instancePath: instancePath + "/capture/method", schemaPath: "#/$defs/CaptureSettings/properties/method/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
          if (!(data1 === "adb" || data1 === "mumu" || data1 === "ldplayer")) {
            const err13 = { instancePath: instancePath + "/capture/method", schemaPath: "#/$defs/CaptureSettings/properties/method/enum", keyword: "enum", params: { allowedValues: schema19.properties.method.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data0.emulatorPath !== void 0) {
          let data2 = data0.emulatorPath;
          if (typeof data2 === "string") {
            if (func2(data2) > 4096) {
              const err14 = { instancePath: instancePath + "/capture/emulatorPath", schemaPath: "#/$defs/CaptureSettings/properties/emulatorPath/maxLength", keyword: "maxLength", params: { limit: 4096 }, message: "must NOT have more than 4096 characters" };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
          } else {
            const err15 = { instancePath: instancePath + "/capture/emulatorPath", schemaPath: "#/$defs/CaptureSettings/properties/emulatorPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
        if (data0.instanceIndex !== void 0) {
          let data3 = data0.instanceIndex;
          if (!(typeof data3 == "number" && (!(data3 % 1) && !isNaN(data3)) && isFinite(data3))) {
            const err16 = { instancePath: instancePath + "/capture/instanceIndex", schemaPath: "#/$defs/CaptureSettings/properties/instanceIndex/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
          if (typeof data3 == "number" && isFinite(data3)) {
            if (data3 > 65535 || isNaN(data3)) {
              const err17 = { instancePath: instancePath + "/capture/instanceIndex", schemaPath: "#/$defs/CaptureSettings/properties/instanceIndex/maximum", keyword: "maximum", params: { comparison: "<=", limit: 65535 }, message: "must be <= 65535" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
            if (data3 < 0 || isNaN(data3)) {
              const err18 = { instancePath: instancePath + "/capture/instanceIndex", schemaPath: "#/$defs/CaptureSettings/properties/instanceIndex/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
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
        const err19 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/CaptureSettings/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
    }
    if (data.autoConnect !== void 0) {
      if (typeof data.autoConnect !== "boolean") {
        const err20 = { instancePath: instancePath + "/autoConnect", schemaPath: "#/properties/autoConnect/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
    }
    if (data.autoUpdateCore !== void 0) {
      if (typeof data.autoUpdateCore !== "boolean") {
        const err21 = { instancePath: instancePath + "/autoUpdateCore", schemaPath: "#/properties/autoUpdateCore/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
        }
        errors++;
      }
    }
    if (data.autoUpdateResource !== void 0) {
      if (typeof data.autoUpdateResource !== "boolean") {
        const err22 = { instancePath: instancePath + "/autoUpdateResource", schemaPath: "#/properties/autoUpdateResource/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
    }
    if (data.minimizeToTray !== void 0) {
      if (typeof data.minimizeToTray !== "boolean") {
        const err23 = { instancePath: instancePath + "/minimizeToTray", schemaPath: "#/properties/minimizeToTray/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
        }
        errors++;
      }
    }
    if (data.theme !== void 0) {
      let data8 = data.theme;
      if (typeof data8 !== "string") {
        const err24 = { instancePath: instancePath + "/theme", schemaPath: "#/properties/theme/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
      if (!(data8 === "dark" || data8 === "light" || data8 === "system")) {
        const err25 = { instancePath: instancePath + "/theme", schemaPath: "#/properties/theme/enum", keyword: "enum", params: { allowedValues: schema18.properties.theme.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
    }
    if (data.budgets !== void 0) {
      let data9 = data.budgets;
      if (data9 && typeof data9 == "object" && !Array.isArray(data9)) {
        if (data9.originium === void 0) {
          const err26 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/required", keyword: "required", params: { missingProperty: "originium" }, message: "must have required property 'originium'" };
          if (vErrors === null) {
            vErrors = [err26];
          } else {
            vErrors.push(err26);
          }
          errors++;
        }
        if (data9.medicine === void 0) {
          const err27 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/required", keyword: "required", params: { missingProperty: "medicine" }, message: "must have required property 'medicine'" };
          if (vErrors === null) {
            vErrors = [err27];
          } else {
            vErrors.push(err27);
          }
          errors++;
        }
        if (data9.expedited === void 0) {
          const err28 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/required", keyword: "required", params: { missingProperty: "expedited" }, message: "must have required property 'expedited'" };
          if (vErrors === null) {
            vErrors = [err28];
          } else {
            vErrors.push(err28);
          }
          errors++;
        }
        for (const key2 in data9) {
          if (!(key2 === "originium" || key2 === "medicine" || key2 === "expedited")) {
            const err29 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err29];
            } else {
              vErrors.push(err29);
            }
            errors++;
          }
        }
        if (data9.originium !== void 0) {
          let data10 = data9.originium;
          if (!(typeof data10 == "number" && (!(data10 % 1) && !isNaN(data10)) && isFinite(data10))) {
            const err30 = { instancePath: instancePath + "/budgets/originium", schemaPath: "#/$defs/Budgets/properties/originium/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err30];
            } else {
              vErrors.push(err30);
            }
            errors++;
          }
          if (typeof data10 == "number" && isFinite(data10)) {
            if (data10 > 100 || isNaN(data10)) {
              const err31 = { instancePath: instancePath + "/budgets/originium", schemaPath: "#/$defs/Budgets/properties/originium/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
              if (vErrors === null) {
                vErrors = [err31];
              } else {
                vErrors.push(err31);
              }
              errors++;
            }
            if (data10 < 0 || isNaN(data10)) {
              const err32 = { instancePath: instancePath + "/budgets/originium", schemaPath: "#/$defs/Budgets/properties/originium/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err32];
              } else {
                vErrors.push(err32);
              }
              errors++;
            }
          }
        }
        if (data9.medicine !== void 0) {
          let data11 = data9.medicine;
          if (!(typeof data11 == "number" && (!(data11 % 1) && !isNaN(data11)) && isFinite(data11))) {
            const err33 = { instancePath: instancePath + "/budgets/medicine", schemaPath: "#/$defs/Budgets/properties/medicine/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err33];
            } else {
              vErrors.push(err33);
            }
            errors++;
          }
          if (typeof data11 == "number" && isFinite(data11)) {
            if (data11 > 100 || isNaN(data11)) {
              const err34 = { instancePath: instancePath + "/budgets/medicine", schemaPath: "#/$defs/Budgets/properties/medicine/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
              if (vErrors === null) {
                vErrors = [err34];
              } else {
                vErrors.push(err34);
              }
              errors++;
            }
            if (data11 < 0 || isNaN(data11)) {
              const err35 = { instancePath: instancePath + "/budgets/medicine", schemaPath: "#/$defs/Budgets/properties/medicine/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err35];
              } else {
                vErrors.push(err35);
              }
              errors++;
            }
          }
        }
        if (data9.expedited !== void 0) {
          let data12 = data9.expedited;
          if (!(typeof data12 == "number" && (!(data12 % 1) && !isNaN(data12)) && isFinite(data12))) {
            const err36 = { instancePath: instancePath + "/budgets/expedited", schemaPath: "#/$defs/Budgets/properties/expedited/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err36];
            } else {
              vErrors.push(err36);
            }
            errors++;
          }
          if (typeof data12 == "number" && isFinite(data12)) {
            if (data12 > 100 || isNaN(data12)) {
              const err37 = { instancePath: instancePath + "/budgets/expedited", schemaPath: "#/$defs/Budgets/properties/expedited/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
              if (vErrors === null) {
                vErrors = [err37];
              } else {
                vErrors.push(err37);
              }
              errors++;
            }
            if (data12 < 0 || isNaN(data12)) {
              const err38 = { instancePath: instancePath + "/budgets/expedited", schemaPath: "#/$defs/Budgets/properties/expedited/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err38];
              } else {
                vErrors.push(err38);
              }
              errors++;
            }
          }
        }
      } else {
        const err39 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err39];
        } else {
          vErrors.push(err39);
        }
        errors++;
      }
    }
    if (data.model !== void 0) {
      let data13 = data.model;
      if (data13 && typeof data13 == "object" && !Array.isArray(data13)) {
        if (data13.provider === void 0) {
          const err40 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/required", keyword: "required", params: { missingProperty: "provider" }, message: "must have required property 'provider'" };
          if (vErrors === null) {
            vErrors = [err40];
          } else {
            vErrors.push(err40);
          }
          errors++;
        }
        if (data13.baseUrl === void 0) {
          const err41 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/required", keyword: "required", params: { missingProperty: "baseUrl" }, message: "must have required property 'baseUrl'" };
          if (vErrors === null) {
            vErrors = [err41];
          } else {
            vErrors.push(err41);
          }
          errors++;
        }
        if (data13.model === void 0) {
          const err42 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/required", keyword: "required", params: { missingProperty: "model" }, message: "must have required property 'model'" };
          if (vErrors === null) {
            vErrors = [err42];
          } else {
            vErrors.push(err42);
          }
          errors++;
        }
        for (const key3 in data13) {
          if (!(key3 === "provider" || key3 === "baseUrl" || key3 === "model")) {
            const err43 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err43];
            } else {
              vErrors.push(err43);
            }
            errors++;
          }
        }
        if (data13.provider !== void 0) {
          if (typeof data13.provider !== "string") {
            const err44 = { instancePath: instancePath + "/model/provider", schemaPath: "#/$defs/ModelSettings/properties/provider/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err44];
            } else {
              vErrors.push(err44);
            }
            errors++;
          }
        }
        if (data13.baseUrl !== void 0) {
          if (typeof data13.baseUrl !== "string") {
            const err45 = { instancePath: instancePath + "/model/baseUrl", schemaPath: "#/$defs/ModelSettings/properties/baseUrl/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err45];
            } else {
              vErrors.push(err45);
            }
            errors++;
          }
        }
        if (data13.model !== void 0) {
          if (typeof data13.model !== "string") {
            const err46 = { instancePath: instancePath + "/model/model", schemaPath: "#/$defs/ModelSettings/properties/model/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err46];
            } else {
              vErrors.push(err46);
            }
            errors++;
          }
        }
      } else {
        const err47 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err47];
        } else {
          vErrors.push(err47);
        }
        errors++;
      }
    }
  } else {
    const err48 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err48];
    } else {
      vErrors.push(err48);
    }
    errors++;
  }
  validate16.errors = vErrors;
  return errors === 0;
}
var validateRpcRequest = validate24;
var schema54 = { "type": "object", "additionalProperties": false, "required": ["jsonrpc", "method"], "properties": { "jsonrpc": { "const": "2.0" }, "method": { "type": "string" }, "id": { "type": ["string", "integer", "null"] }, "params": { "type": "object", "additionalProperties": true } } };
function validate24(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
        const err5 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/type", keyword: "type", params: { type: schema54.properties.id.type }, message: "must be string,integer,null" };
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
  validate24.errors = vErrors;
  return errors === 0;
}
var validateRpcEvent = validate25;
function validate25(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
  validate25.errors = vErrors;
  return errors === 0;
}
var validateDeviceFrameParams = validate26;
function validate26(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
        if (func2(data0) > 200) {
          const err2 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (func2(data0) < 1) {
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
  validate26.errors = vErrors;
  return errors === 0;
}
var validateDeviceClickParams = validate27;
function validate27(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
        if (func2(data0) > 200) {
          const err6 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (func2(data0) < 1) {
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
        if (func2(data1) > 200) {
          const err9 = { instancePath: instancePath + "/frameId", schemaPath: "#/properties/frameId/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
        if (func2(data1) < 1) {
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
        if (func2(data4) > 200) {
          const err18 = { instancePath: instancePath + "/requestId", schemaPath: "#/properties/requestId/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
        if (func2(data4) < 1) {
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
  validate27.errors = vErrors;
  return errors === 0;
}
var validateScreenFrame = validate28;
var schema47 = { "description": "Transient MaaCore preview PNG. Its width/height are the click coordinate space; image bytes never enter snapshots or persistence.", "type": "object", "additionalProperties": false, "required": ["deviceId", "frameId", "capturedAt", "width", "height", "mimeType", "data", "canControl", "latencyMs"], "properties": { "deviceId": { "type": "string", "minLength": 1, "maxLength": 200 }, "frameId": { "type": "string", "minLength": 1, "maxLength": 200 }, "capturedAt": { "type": "string", "minLength": 1, "maxLength": 40 }, "width": { "type": "integer", "minimum": 1, "maximum": 8192 }, "height": { "type": "integer", "minimum": 1, "maximum": 8192 }, "mimeType": { "const": "image/png" }, "data": { "type": "string", "minLength": 1, "maxLength": 4183384 }, "canControl": { "type": "boolean" }, "latencyMs": { "type": "number", "minimum": 0 } } };
function validate28(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
      if (!func3.call(schema47.properties, key0)) {
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
        if (func2(data0) > 200) {
          const err10 = { instancePath: instancePath + "/deviceId", schemaPath: "#/properties/deviceId/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
        if (func2(data0) < 1) {
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
        if (func2(data1) > 200) {
          const err13 = { instancePath: instancePath + "/frameId", schemaPath: "#/properties/frameId/maxLength", keyword: "maxLength", params: { limit: 200 }, message: "must NOT have more than 200 characters" };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
        if (func2(data1) < 1) {
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
        if (func2(data2) > 40) {
          const err16 = { instancePath: instancePath + "/capturedAt", schemaPath: "#/properties/capturedAt/maxLength", keyword: "maxLength", params: { limit: 40 }, message: "must NOT have more than 40 characters" };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
        if (func2(data2) < 1) {
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
        if (func2(data6) > 4183384) {
          const err26 = { instancePath: instancePath + "/data", schemaPath: "#/properties/data/maxLength", keyword: "maxLength", params: { limit: 4183384 }, message: "must NOT have more than 4183384 characters" };
          if (vErrors === null) {
            vErrors = [err26];
          } else {
            vErrors.push(err26);
          }
          errors++;
        }
        if (func2(data6) < 1) {
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
  validate28.errors = vErrors;
  return errors === 0;
}
var validateWorkerFrame = validate32;
function validate32(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
        if (func2(data3) > 4183384) {
          const err13 = { instancePath: instancePath + "/data", schemaPath: "#/properties/data/maxLength", keyword: "maxLength", params: { limit: 4183384 }, message: "must NOT have more than 4183384 characters" };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
        if (func2(data3) < 1) {
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
  validate32.errors = vErrors;
  return errors === 0;
}
var validateWorkerConfiguration = validate33;
var schema61 = { "type": "object", "additionalProperties": false, "required": ["protocolVersion", "core", "resource", "adb", "address", "userDir", "lockPath"], "properties": { "protocolVersion": { "const": 1 }, "core": { "type": "string", "minLength": 1 }, "resource": { "type": "string", "minLength": 1 }, "adb": { "type": "string", "minLength": 1 }, "address": { "type": "string", "minLength": 1 }, "userDir": { "type": "string", "minLength": 1 }, "lockPath": { "type": "string", "minLength": 1 }, "capture": { "$ref": "#/$defs/WorkerCaptureConfiguration" }, "lockTimeoutMs": { "type": "integer", "minimum": 0, "maximum": 6e4 }, "startupTimeoutMs": { "type": "integer", "minimum": 1, "maximum": 12e4 }, "nativeCallTimeoutMs": { "type": "integer", "minimum": 1, "maximum": 12e4 }, "asyncTimeoutMs": { "type": "integer", "minimum": 1, "maximum": 12e4 }, "shutdownTimeoutMs": { "type": "integer", "minimum": 1, "maximum": 12e4 } } };
function validate33(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
      if (!func3.call(schema61.properties, key0)) {
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
        if (func2(data1) < 1) {
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
        if (func2(data2) < 1) {
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
        if (func2(data3) < 1) {
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
        if (func2(data4) < 1) {
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
        if (func2(data5) < 1) {
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
        if (func2(data6) < 1) {
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
          if (!(key2 === "method" || key2 === "emulatorPath" || key2 === "instanceIndex")) {
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
            if (func2(data10) < 1) {
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
      } else {
        const err35 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err35];
        } else {
          vErrors.push(err35);
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
        const _errs30 = errors;
        if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
          if (data7.method === void 0) {
            const err36 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/2/required", keyword: "required", params: { missingProperty: "method" }, message: "must have required property 'method'" };
            if (vErrors === null) {
              vErrors = [err36];
            } else {
              vErrors.push(err36);
            }
            errors++;
          }
          if (data7.emulatorPath === void 0) {
            const err37 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/2/required", keyword: "required", params: { missingProperty: "emulatorPath" }, message: "must have required property 'emulatorPath'" };
            if (vErrors === null) {
              vErrors = [err37];
            } else {
              vErrors.push(err37);
            }
            errors++;
          }
          if (data7.instanceIndex === void 0) {
            const err38 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/2/required", keyword: "required", params: { missingProperty: "instanceIndex" }, message: "must have required property 'instanceIndex'" };
            if (vErrors === null) {
              vErrors = [err38];
            } else {
              vErrors.push(err38);
            }
            errors++;
          }
          for (const key3 in data7) {
            if (!(key3 === "method" || key3 === "emulatorPath" || key3 === "instanceIndex" || key3 === "pid")) {
              const err39 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err39];
              } else {
                vErrors.push(err39);
              }
              errors++;
            }
          }
          if (data7.method !== void 0) {
            if ("ldplayer" !== data7.method) {
              const err40 = { instancePath: instancePath + "/capture/method", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/2/properties/method/const", keyword: "const", params: { allowedValue: "ldplayer" }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err40];
              } else {
                vErrors.push(err40);
              }
              errors++;
            }
          }
          if (data7.emulatorPath !== void 0) {
            let data13 = data7.emulatorPath;
            if (typeof data13 === "string") {
              if (func2(data13) < 1) {
                const err41 = { instancePath: instancePath + "/capture/emulatorPath", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/2/properties/emulatorPath/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                if (vErrors === null) {
                  vErrors = [err41];
                } else {
                  vErrors.push(err41);
                }
                errors++;
              }
            } else {
              const err42 = { instancePath: instancePath + "/capture/emulatorPath", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/2/properties/emulatorPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err42];
              } else {
                vErrors.push(err42);
              }
              errors++;
            }
          }
          if (data7.instanceIndex !== void 0) {
            let data14 = data7.instanceIndex;
            if (!(typeof data14 == "number" && (!(data14 % 1) && !isNaN(data14)) && isFinite(data14))) {
              const err43 = { instancePath: instancePath + "/capture/instanceIndex", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/2/properties/instanceIndex/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
              if (vErrors === null) {
                vErrors = [err43];
              } else {
                vErrors.push(err43);
              }
              errors++;
            }
            if (typeof data14 == "number" && isFinite(data14)) {
              if (data14 > 2147483647 || isNaN(data14)) {
                const err44 = { instancePath: instancePath + "/capture/instanceIndex", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/2/properties/instanceIndex/maximum", keyword: "maximum", params: { comparison: "<=", limit: 2147483647 }, message: "must be <= 2147483647" };
                if (vErrors === null) {
                  vErrors = [err44];
                } else {
                  vErrors.push(err44);
                }
                errors++;
              }
              if (data14 < 0 || isNaN(data14)) {
                const err45 = { instancePath: instancePath + "/capture/instanceIndex", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/2/properties/instanceIndex/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                if (vErrors === null) {
                  vErrors = [err45];
                } else {
                  vErrors.push(err45);
                }
                errors++;
              }
            }
          }
          if (data7.pid !== void 0) {
            let data15 = data7.pid;
            if (!(typeof data15 == "number" && (!(data15 % 1) && !isNaN(data15)) && isFinite(data15))) {
              const err46 = { instancePath: instancePath + "/capture/pid", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/2/properties/pid/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
              if (vErrors === null) {
                vErrors = [err46];
              } else {
                vErrors.push(err46);
              }
              errors++;
            }
            if (typeof data15 == "number" && isFinite(data15)) {
              if (data15 > 2147483647 || isNaN(data15)) {
                const err47 = { instancePath: instancePath + "/capture/pid", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/2/properties/pid/maximum", keyword: "maximum", params: { comparison: "<=", limit: 2147483647 }, message: "must be <= 2147483647" };
                if (vErrors === null) {
                  vErrors = [err47];
                } else {
                  vErrors.push(err47);
                }
                errors++;
              }
              if (data15 < 1 || isNaN(data15)) {
                const err48 = { instancePath: instancePath + "/capture/pid", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/2/properties/pid/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                if (vErrors === null) {
                  vErrors = [err48];
                } else {
                  vErrors.push(err48);
                }
                errors++;
              }
            }
          }
        } else {
          const err49 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err49];
          } else {
            vErrors.push(err49);
          }
          errors++;
        }
        var _valid0 = _errs30 === errors;
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
        const err50 = { instancePath: instancePath + "/capture", schemaPath: "#/$defs/WorkerCaptureConfiguration/oneOf", keyword: "oneOf", params: { passingSchemas: passing0 }, message: "must match exactly one schema in oneOf" };
        if (vErrors === null) {
          vErrors = [err50];
        } else {
          vErrors.push(err50);
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
    if (data.lockTimeoutMs !== void 0) {
      let data16 = data.lockTimeoutMs;
      if (!(typeof data16 == "number" && (!(data16 % 1) && !isNaN(data16)) && isFinite(data16))) {
        const err51 = { instancePath: instancePath + "/lockTimeoutMs", schemaPath: "#/properties/lockTimeoutMs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err51];
        } else {
          vErrors.push(err51);
        }
        errors++;
      }
      if (typeof data16 == "number" && isFinite(data16)) {
        if (data16 > 6e4 || isNaN(data16)) {
          const err52 = { instancePath: instancePath + "/lockTimeoutMs", schemaPath: "#/properties/lockTimeoutMs/maximum", keyword: "maximum", params: { comparison: "<=", limit: 6e4 }, message: "must be <= 60000" };
          if (vErrors === null) {
            vErrors = [err52];
          } else {
            vErrors.push(err52);
          }
          errors++;
        }
        if (data16 < 0 || isNaN(data16)) {
          const err53 = { instancePath: instancePath + "/lockTimeoutMs", schemaPath: "#/properties/lockTimeoutMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
          if (vErrors === null) {
            vErrors = [err53];
          } else {
            vErrors.push(err53);
          }
          errors++;
        }
      }
    }
    if (data.startupTimeoutMs !== void 0) {
      let data17 = data.startupTimeoutMs;
      if (!(typeof data17 == "number" && (!(data17 % 1) && !isNaN(data17)) && isFinite(data17))) {
        const err54 = { instancePath: instancePath + "/startupTimeoutMs", schemaPath: "#/properties/startupTimeoutMs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err54];
        } else {
          vErrors.push(err54);
        }
        errors++;
      }
      if (typeof data17 == "number" && isFinite(data17)) {
        if (data17 > 12e4 || isNaN(data17)) {
          const err55 = { instancePath: instancePath + "/startupTimeoutMs", schemaPath: "#/properties/startupTimeoutMs/maximum", keyword: "maximum", params: { comparison: "<=", limit: 12e4 }, message: "must be <= 120000" };
          if (vErrors === null) {
            vErrors = [err55];
          } else {
            vErrors.push(err55);
          }
          errors++;
        }
        if (data17 < 1 || isNaN(data17)) {
          const err56 = { instancePath: instancePath + "/startupTimeoutMs", schemaPath: "#/properties/startupTimeoutMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
          if (vErrors === null) {
            vErrors = [err56];
          } else {
            vErrors.push(err56);
          }
          errors++;
        }
      }
    }
    if (data.nativeCallTimeoutMs !== void 0) {
      let data18 = data.nativeCallTimeoutMs;
      if (!(typeof data18 == "number" && (!(data18 % 1) && !isNaN(data18)) && isFinite(data18))) {
        const err57 = { instancePath: instancePath + "/nativeCallTimeoutMs", schemaPath: "#/properties/nativeCallTimeoutMs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err57];
        } else {
          vErrors.push(err57);
        }
        errors++;
      }
      if (typeof data18 == "number" && isFinite(data18)) {
        if (data18 > 12e4 || isNaN(data18)) {
          const err58 = { instancePath: instancePath + "/nativeCallTimeoutMs", schemaPath: "#/properties/nativeCallTimeoutMs/maximum", keyword: "maximum", params: { comparison: "<=", limit: 12e4 }, message: "must be <= 120000" };
          if (vErrors === null) {
            vErrors = [err58];
          } else {
            vErrors.push(err58);
          }
          errors++;
        }
        if (data18 < 1 || isNaN(data18)) {
          const err59 = { instancePath: instancePath + "/nativeCallTimeoutMs", schemaPath: "#/properties/nativeCallTimeoutMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
          if (vErrors === null) {
            vErrors = [err59];
          } else {
            vErrors.push(err59);
          }
          errors++;
        }
      }
    }
    if (data.asyncTimeoutMs !== void 0) {
      let data19 = data.asyncTimeoutMs;
      if (!(typeof data19 == "number" && (!(data19 % 1) && !isNaN(data19)) && isFinite(data19))) {
        const err60 = { instancePath: instancePath + "/asyncTimeoutMs", schemaPath: "#/properties/asyncTimeoutMs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err60];
        } else {
          vErrors.push(err60);
        }
        errors++;
      }
      if (typeof data19 == "number" && isFinite(data19)) {
        if (data19 > 12e4 || isNaN(data19)) {
          const err61 = { instancePath: instancePath + "/asyncTimeoutMs", schemaPath: "#/properties/asyncTimeoutMs/maximum", keyword: "maximum", params: { comparison: "<=", limit: 12e4 }, message: "must be <= 120000" };
          if (vErrors === null) {
            vErrors = [err61];
          } else {
            vErrors.push(err61);
          }
          errors++;
        }
        if (data19 < 1 || isNaN(data19)) {
          const err62 = { instancePath: instancePath + "/asyncTimeoutMs", schemaPath: "#/properties/asyncTimeoutMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
          if (vErrors === null) {
            vErrors = [err62];
          } else {
            vErrors.push(err62);
          }
          errors++;
        }
      }
    }
    if (data.shutdownTimeoutMs !== void 0) {
      let data20 = data.shutdownTimeoutMs;
      if (!(typeof data20 == "number" && (!(data20 % 1) && !isNaN(data20)) && isFinite(data20))) {
        const err63 = { instancePath: instancePath + "/shutdownTimeoutMs", schemaPath: "#/properties/shutdownTimeoutMs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
        if (vErrors === null) {
          vErrors = [err63];
        } else {
          vErrors.push(err63);
        }
        errors++;
      }
      if (typeof data20 == "number" && isFinite(data20)) {
        if (data20 > 12e4 || isNaN(data20)) {
          const err64 = { instancePath: instancePath + "/shutdownTimeoutMs", schemaPath: "#/properties/shutdownTimeoutMs/maximum", keyword: "maximum", params: { comparison: "<=", limit: 12e4 }, message: "must be <= 120000" };
          if (vErrors === null) {
            vErrors = [err64];
          } else {
            vErrors.push(err64);
          }
          errors++;
        }
        if (data20 < 1 || isNaN(data20)) {
          const err65 = { instancePath: instancePath + "/shutdownTimeoutMs", schemaPath: "#/properties/shutdownTimeoutMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
          if (vErrors === null) {
            vErrors = [err65];
          } else {
            vErrors.push(err65);
          }
          errors++;
        }
      }
    }
  } else {
    const err66 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err66];
    } else {
      vErrors.push(err66);
    }
    errors++;
  }
  validate33.errors = vErrors;
  return errors === 0;
}
var validateWorkerLeaseConfiguration = validate34;
function validate34(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
        if (func2(data1) < 1) {
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
  validate34.errors = vErrors;
  return errors === 0;
}
var validateWorkerValidationConfiguration = validate35;
function validate35(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
        if (func2(data1) < 1) {
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
        if (func2(data2) < 1) {
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
        if (func2(data3) < 1) {
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
  validate35.errors = vErrors;
  return errors === 0;
}
var validateWorkerCommand = validate36;
var schema65 = { "oneOf": [{ "type": "object", "additionalProperties": false, "required": ["protocolVersion", "id", "operation"], "properties": { "protocolVersion": { "const": 1 }, "id": { "type": ["string", "integer"] }, "operation": { "enum": ["connect", "stop", "screencap", "frame"] } } }, { "type": "object", "additionalProperties": false, "required": ["protocolVersion", "id", "operation", "x", "y"], "properties": { "protocolVersion": { "const": 1 }, "id": { "type": ["string", "integer"] }, "operation": { "const": "click" }, "x": { "type": "integer", "minimum": 0, "maximum": 8191 }, "y": { "type": "integer", "minimum": 0, "maximum": 8191 } } }, { "type": "object", "additionalProperties": false, "required": ["protocolVersion", "id", "operation", "task"], "properties": { "protocolVersion": { "const": 1 }, "id": { "type": ["string", "integer"] }, "operation": { "const": "task" }, "task": { "type": "object", "additionalProperties": false, "required": ["type", "params"], "properties": { "type": { "type": "string", "minLength": 1 }, "params": { "type": "object", "additionalProperties": true } } } } }] };
function validate36(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
        const err5 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/0/properties/id/type", keyword: "type", params: { type: schema65.oneOf[0].properties.id.type }, message: "must be string,integer" };
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
        const err6 = { instancePath: instancePath + "/operation", schemaPath: "#/oneOf/0/properties/operation/enum", keyword: "enum", params: { allowedValues: schema65.oneOf[0].properties.operation.enum }, message: "must be equal to one of the allowed values" };
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
        const err15 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/1/properties/id/type", keyword: "type", params: { type: schema65.oneOf[1].properties.id.type }, message: "must be string,integer" };
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
          const err30 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/2/properties/id/type", keyword: "type", params: { type: schema65.oneOf[2].properties.id.type }, message: "must be string,integer" };
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
              if (func2(data12) < 1) {
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
  validate36.errors = vErrors;
  return errors === 0;
}
var validateWorkerEvent = validate37;
var schema66 = { "oneOf": [{ "type": "object", "additionalProperties": false, "required": ["protocolVersion", "type"], "properties": { "protocolVersion": { "const": 1 }, "type": { "const": "ready" }, "mode": { "const": "lease-only" } } }, { "type": "object", "additionalProperties": false, "required": ["protocolVersion", "type", "id", "result"], "properties": { "protocolVersion": { "const": 1 }, "type": { "const": "response" }, "id": { "type": ["string", "integer", "null"] }, "result": { "type": "object", "additionalProperties": true } } }, { "type": "object", "additionalProperties": false, "required": ["protocolVersion", "type", "id", "error"], "properties": { "protocolVersion": { "const": 1 }, "type": { "const": "response" }, "id": { "type": ["string", "integer", "null"] }, "error": { "type": "string" } } }, { "type": "object", "additionalProperties": false, "required": ["protocolVersion", "type", "message", "details"], "properties": { "protocolVersion": { "const": 1 }, "type": { "const": "callback" }, "message": { "type": "integer" }, "details": { "type": "object", "additionalProperties": true } } }, { "type": "object", "additionalProperties": false, "required": ["protocolVersion", "type", "running", "pendingAsync"], "properties": { "protocolVersion": { "const": 1 }, "type": { "const": "status" }, "running": { "type": "boolean" }, "pendingAsync": { "type": "array", "items": { "type": "integer", "minimum": 1 }, "uniqueItems": true } } }] };
function validate37(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
        const err14 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/1/properties/id/type", keyword: "type", params: { type: schema66.oneOf[1].properties.id.type }, message: "must be string,integer,null" };
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
          const err24 = { instancePath: instancePath + "/id", schemaPath: "#/oneOf/2/properties/id/type", keyword: "type", params: { type: schema66.oneOf[2].properties.id.type }, message: "must be string,integer,null" };
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
  validate37.errors = vErrors;
  return errors === 0;
}
var validateWorkerValidation = validate38;
function validate38(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
  validate38.errors = vErrors;
  return errors === 0;
}
export {
  validateDeviceClickParams,
  validateDeviceFrameParams,
  validatePlan,
  validateRpcEvent,
  validateRpcRequest,
  validateScreenFrame,
  validateSettings,
  validateSnapshot,
  validateWorkerCommand,
  validateWorkerConfiguration,
  validateWorkerEvent,
  validateWorkerFrame,
  validateWorkerLeaseConfiguration,
  validateWorkerValidation,
  validateWorkerValidationConfiguration
};
