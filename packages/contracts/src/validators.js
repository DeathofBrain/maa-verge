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
var schema11 = { "$schema": "http://json-schema.org/draft-07/schema#", "$id": "https://maaverge.local/contracts/runtime.schema.json", "$comment": "Authoritative runtime contract. Edit this source, then run pnpm contracts:generate. Defaults are applied by the application models, not validators.", "$defs": { "Budgets": { "additionalProperties": false, "properties": { "originium": { "default": 0, "maximum": 100, "minimum": 0, "title": "Originium", "type": "integer" }, "medicine": { "default": 0, "maximum": 100, "minimum": 0, "title": "Medicine", "type": "integer" }, "expedited": { "default": 0, "maximum": 100, "minimum": 0, "title": "Expedited", "type": "integer" } }, "required": ["originium", "medicine", "expedited"], "title": "Budgets", "type": "object" }, "Device": { "additionalProperties": false, "properties": { "id": { "title": "Id", "type": "string" }, "name": { "title": "Name", "type": "string" }, "address": { "title": "Address", "type": "string" }, "state": { "enum": ["idle", "running", "offline"], "title": "State", "type": "string" }, "coreVersion": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Coreversion" }, "resourceVersion": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Resourceversion" } }, "required": ["id", "name", "address", "state", "coreVersion", "resourceVersion"], "title": "Device", "type": "object" }, "Event": { "additionalProperties": false, "properties": { "id": { "title": "Id", "type": "integer" }, "type": { "title": "Type", "type": "string" }, "message": { "title": "Message", "type": "string" }, "createdAt": { "title": "Createdat", "type": "string" }, "data": { "additionalProperties": true, "title": "Data", "type": "object" } }, "required": ["id", "type", "message", "createdAt", "data"], "title": "Event", "type": "object" }, "ModelSettings": { "additionalProperties": false, "properties": { "provider": { "default": "none", "title": "Provider", "type": "string" }, "baseUrl": { "default": "", "title": "Baseurl", "type": "string" }, "model": { "default": "", "title": "Model", "type": "string" } }, "required": ["provider", "baseUrl", "model"], "title": "ModelSettings", "type": "object" }, "Plan": { "additionalProperties": false, "properties": { "id": { "default": "", "title": "Id", "type": "string" }, "name": { "maxLength": 80, "minLength": 1, "title": "Name", "type": "string" }, "description": { "default": "", "maxLength": 500, "title": "Description", "type": "string" }, "deviceId": { "anyOf": [{ "maxLength": 200, "minLength": 1, "type": "string" }, { "type": "null" }], "default": null, "title": "Deviceid" }, "group": { "default": "daily", "enum": ["daily", "specialized"], "title": "Group", "type": "string" }, "budgets": { "anyOf": [{ "$ref": "#/$defs/Budgets" }, { "type": "null" }], "default": null }, "tasks": { "items": { "$ref": "#/$defs/Task" }, "maxItems": 30, "minItems": 1, "title": "Tasks", "type": "array" }, "schedule": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Schedule" }, "enabled": { "default": true, "title": "Enabled", "type": "boolean" } }, "required": ["id", "name", "description", "deviceId", "group", "budgets", "tasks", "schedule", "enabled"], "title": "Plan", "type": "object" }, "Run": { "additionalProperties": false, "properties": { "id": { "title": "Id", "type": "string" }, "planId": { "title": "Planid", "type": "string" }, "deviceId": { "title": "Deviceid", "type": "string" }, "status": { "enum": ["running", "completed", "failed", "stopped"], "title": "Status", "type": "string" }, "progress": { "maximum": 100, "minimum": 0, "title": "Progress", "type": "integer" }, "message": { "title": "Message", "type": "string" }, "startedAt": { "title": "Startedat", "type": "string" }, "finishedAt": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Finishedat" } }, "required": ["id", "planId", "deviceId", "status", "progress", "message", "startedAt", "finishedAt"], "title": "Run", "type": "object" }, "Settings": { "additionalProperties": false, "properties": { "autoConnect": { "default": true, "title": "Autoconnect", "type": "boolean" }, "autoUpdateCore": { "default": true, "title": "Autoupdatecore", "type": "boolean" }, "autoUpdateResource": { "default": true, "title": "Autoupdateresource", "type": "boolean" }, "minimizeToTray": { "default": true, "title": "Minimizetotray", "type": "boolean" }, "theme": { "default": "system", "enum": ["dark", "light", "system"], "title": "Theme", "type": "string" }, "budgets": { "$ref": "#/$defs/Budgets" }, "model": { "$ref": "#/$defs/ModelSettings" } }, "required": ["autoConnect", "autoUpdateCore", "autoUpdateResource", "minimizeToTray", "theme", "budgets", "model"], "title": "Settings", "type": "object" }, "Task": { "additionalProperties": false, "properties": { "type": { "enum": ["StartUp", "CloseDown", "Fight", "Recruit", "Infrast", "Mall", "Award", "SwitchTheme", "Roguelike", "Copilot", "SSSCopilot", "ParadoxCopilot", "Depot", "OperBox", "Reclamation", "Custom", "SingleStep", "VideoRecognition", "OperProgress"], "title": "Type", "type": "string" }, "params": { "additionalProperties": true, "title": "Params", "type": "object" }, "enabled": { "default": true, "title": "Enabled", "type": "boolean" } }, "required": ["type", "params", "enabled"], "title": "Task", "type": "object" }, "UpdateChannel": { "additionalProperties": false, "properties": { "id": { "enum": ["app", "core", "resource"], "title": "Id", "type": "string" }, "currentVersion": { "title": "Currentversion", "type": "string" }, "latestVersion": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Latestversion" }, "status": { "default": "idle", "enum": ["idle", "checking", "available", "downloading", "staged", "waiting_idle", "active", "failed"], "title": "Status", "type": "string" }, "progress": { "default": 0, "maximum": 100, "minimum": 0, "title": "Progress", "type": "integer" }, "message": { "default": "", "title": "Message", "type": "string" } }, "required": ["id", "currentVersion", "latestVersion", "status", "progress", "message"], "title": "UpdateChannel", "type": "object" } }, "additionalProperties": false, "properties": { "mode": { "enum": ["mock", "native"], "title": "Mode", "type": "string" }, "devices": { "items": { "$ref": "#/$defs/Device" }, "title": "Devices", "type": "array" }, "plans": { "items": { "$ref": "#/$defs/Plan" }, "title": "Plans", "type": "array" }, "runs": { "items": { "$ref": "#/$defs/Run" }, "title": "Runs", "type": "array" }, "updates": { "items": { "$ref": "#/$defs/UpdateChannel" }, "title": "Updates", "type": "array" }, "settings": { "$ref": "#/$defs/Settings" }, "events": { "items": { "$ref": "#/$defs/Event" }, "title": "Events", "type": "array" } }, "required": ["mode", "devices", "plans", "runs", "updates", "settings", "events"], "title": "Snapshot", "type": "object" };
var schema12 = { "additionalProperties": false, "properties": { "id": { "title": "Id", "type": "string" }, "name": { "title": "Name", "type": "string" }, "address": { "title": "Address", "type": "string" }, "state": { "enum": ["idle", "running", "offline"], "title": "State", "type": "string" }, "coreVersion": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Coreversion" }, "resourceVersion": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Resourceversion" } }, "required": ["id", "name", "address", "state", "coreVersion", "resourceVersion"], "title": "Device", "type": "object" };
var schema16 = { "additionalProperties": false, "properties": { "id": { "title": "Id", "type": "string" }, "planId": { "title": "Planid", "type": "string" }, "deviceId": { "title": "Deviceid", "type": "string" }, "status": { "enum": ["running", "completed", "failed", "stopped"], "title": "Status", "type": "string" }, "progress": { "maximum": 100, "minimum": 0, "title": "Progress", "type": "integer" }, "message": { "title": "Message", "type": "string" }, "startedAt": { "title": "Startedat", "type": "string" }, "finishedAt": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Finishedat" } }, "required": ["id", "planId", "deviceId", "status", "progress", "message", "startedAt", "finishedAt"], "title": "Run", "type": "object" };
var schema17 = { "additionalProperties": false, "properties": { "id": { "enum": ["app", "core", "resource"], "title": "Id", "type": "string" }, "currentVersion": { "title": "Currentversion", "type": "string" }, "latestVersion": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Latestversion" }, "status": { "default": "idle", "enum": ["idle", "checking", "available", "downloading", "staged", "waiting_idle", "active", "failed"], "title": "Status", "type": "string" }, "progress": { "default": 0, "maximum": 100, "minimum": 0, "title": "Progress", "type": "integer" }, "message": { "default": "", "title": "Message", "type": "string" } }, "required": ["id", "currentVersion", "latestVersion", "status", "progress", "message"], "title": "UpdateChannel", "type": "object" };
var schema13 = { "additionalProperties": false, "properties": { "id": { "default": "", "title": "Id", "type": "string" }, "name": { "maxLength": 80, "minLength": 1, "title": "Name", "type": "string" }, "description": { "default": "", "maxLength": 500, "title": "Description", "type": "string" }, "deviceId": { "anyOf": [{ "maxLength": 200, "minLength": 1, "type": "string" }, { "type": "null" }], "default": null, "title": "Deviceid" }, "group": { "default": "daily", "enum": ["daily", "specialized"], "title": "Group", "type": "string" }, "budgets": { "anyOf": [{ "$ref": "#/$defs/Budgets" }, { "type": "null" }], "default": null }, "tasks": { "items": { "$ref": "#/$defs/Task" }, "maxItems": 30, "minItems": 1, "title": "Tasks", "type": "array" }, "schedule": { "anyOf": [{ "type": "string" }, { "type": "null" }], "default": null, "title": "Schedule" }, "enabled": { "default": true, "title": "Enabled", "type": "boolean" } }, "required": ["id", "name", "description", "deviceId", "group", "budgets", "tasks", "schedule", "enabled"], "title": "Plan", "type": "object" };
var schema15 = { "additionalProperties": false, "properties": { "type": { "enum": ["StartUp", "CloseDown", "Fight", "Recruit", "Infrast", "Mall", "Award", "SwitchTheme", "Roguelike", "Copilot", "SSSCopilot", "ParadoxCopilot", "Depot", "OperBox", "Reclamation", "Custom", "SingleStep", "VideoRecognition", "OperProgress"], "title": "Type", "type": "string" }, "params": { "additionalProperties": true, "title": "Params", "type": "object" }, "enabled": { "default": true, "title": "Enabled", "type": "boolean" } }, "required": ["type", "params", "enabled"], "title": "Task", "type": "object" };
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
      if (!func2.call(schema13.properties, key0)) {
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
var schema18 = { "additionalProperties": false, "properties": { "autoConnect": { "default": true, "title": "Autoconnect", "type": "boolean" }, "autoUpdateCore": { "default": true, "title": "Autoupdatecore", "type": "boolean" }, "autoUpdateResource": { "default": true, "title": "Autoupdateresource", "type": "boolean" }, "minimizeToTray": { "default": true, "title": "Minimizetotray", "type": "boolean" }, "theme": { "default": "system", "enum": ["dark", "light", "system"], "title": "Theme", "type": "string" }, "budgets": { "$ref": "#/$defs/Budgets" }, "model": { "$ref": "#/$defs/ModelSettings" } }, "required": ["autoConnect", "autoUpdateCore", "autoUpdateResource", "minimizeToTray", "theme", "budgets", "model"], "title": "Settings", "type": "object" };
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
      if (!(key0 === "autoConnect" || key0 === "autoUpdateCore" || key0 === "autoUpdateResource" || key0 === "minimizeToTray" || key0 === "theme" || key0 === "budgets" || key0 === "model")) {
        const err7 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.autoConnect !== void 0) {
      if (typeof data.autoConnect !== "boolean") {
        const err8 = { instancePath: instancePath + "/autoConnect", schemaPath: "#/properties/autoConnect/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.autoUpdateCore !== void 0) {
      if (typeof data.autoUpdateCore !== "boolean") {
        const err9 = { instancePath: instancePath + "/autoUpdateCore", schemaPath: "#/properties/autoUpdateCore/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.autoUpdateResource !== void 0) {
      if (typeof data.autoUpdateResource !== "boolean") {
        const err10 = { instancePath: instancePath + "/autoUpdateResource", schemaPath: "#/properties/autoUpdateResource/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.minimizeToTray !== void 0) {
      if (typeof data.minimizeToTray !== "boolean") {
        const err11 = { instancePath: instancePath + "/minimizeToTray", schemaPath: "#/properties/minimizeToTray/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.theme !== void 0) {
      let data4 = data.theme;
      if (typeof data4 !== "string") {
        const err12 = { instancePath: instancePath + "/theme", schemaPath: "#/properties/theme/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
      if (!(data4 === "dark" || data4 === "light" || data4 === "system")) {
        const err13 = { instancePath: instancePath + "/theme", schemaPath: "#/properties/theme/enum", keyword: "enum", params: { allowedValues: schema18.properties.theme.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
    if (data.budgets !== void 0) {
      let data5 = data.budgets;
      if (data5 && typeof data5 == "object" && !Array.isArray(data5)) {
        if (data5.originium === void 0) {
          const err14 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/required", keyword: "required", params: { missingProperty: "originium" }, message: "must have required property 'originium'" };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
        if (data5.medicine === void 0) {
          const err15 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/required", keyword: "required", params: { missingProperty: "medicine" }, message: "must have required property 'medicine'" };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
        if (data5.expedited === void 0) {
          const err16 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/required", keyword: "required", params: { missingProperty: "expedited" }, message: "must have required property 'expedited'" };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
        for (const key1 in data5) {
          if (!(key1 === "originium" || key1 === "medicine" || key1 === "expedited")) {
            const err17 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
        if (data5.originium !== void 0) {
          let data6 = data5.originium;
          if (!(typeof data6 == "number" && (!(data6 % 1) && !isNaN(data6)) && isFinite(data6))) {
            const err18 = { instancePath: instancePath + "/budgets/originium", schemaPath: "#/$defs/Budgets/properties/originium/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
          if (typeof data6 == "number" && isFinite(data6)) {
            if (data6 > 100 || isNaN(data6)) {
              const err19 = { instancePath: instancePath + "/budgets/originium", schemaPath: "#/$defs/Budgets/properties/originium/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
            if (data6 < 0 || isNaN(data6)) {
              const err20 = { instancePath: instancePath + "/budgets/originium", schemaPath: "#/$defs/Budgets/properties/originium/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err20];
              } else {
                vErrors.push(err20);
              }
              errors++;
            }
          }
        }
        if (data5.medicine !== void 0) {
          let data7 = data5.medicine;
          if (!(typeof data7 == "number" && (!(data7 % 1) && !isNaN(data7)) && isFinite(data7))) {
            const err21 = { instancePath: instancePath + "/budgets/medicine", schemaPath: "#/$defs/Budgets/properties/medicine/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err21];
            } else {
              vErrors.push(err21);
            }
            errors++;
          }
          if (typeof data7 == "number" && isFinite(data7)) {
            if (data7 > 100 || isNaN(data7)) {
              const err22 = { instancePath: instancePath + "/budgets/medicine", schemaPath: "#/$defs/Budgets/properties/medicine/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
              if (vErrors === null) {
                vErrors = [err22];
              } else {
                vErrors.push(err22);
              }
              errors++;
            }
            if (data7 < 0 || isNaN(data7)) {
              const err23 = { instancePath: instancePath + "/budgets/medicine", schemaPath: "#/$defs/Budgets/properties/medicine/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
          }
        }
        if (data5.expedited !== void 0) {
          let data8 = data5.expedited;
          if (!(typeof data8 == "number" && (!(data8 % 1) && !isNaN(data8)) && isFinite(data8))) {
            const err24 = { instancePath: instancePath + "/budgets/expedited", schemaPath: "#/$defs/Budgets/properties/expedited/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
          if (typeof data8 == "number" && isFinite(data8)) {
            if (data8 > 100 || isNaN(data8)) {
              const err25 = { instancePath: instancePath + "/budgets/expedited", schemaPath: "#/$defs/Budgets/properties/expedited/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
              if (vErrors === null) {
                vErrors = [err25];
              } else {
                vErrors.push(err25);
              }
              errors++;
            }
            if (data8 < 0 || isNaN(data8)) {
              const err26 = { instancePath: instancePath + "/budgets/expedited", schemaPath: "#/$defs/Budgets/properties/expedited/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err26];
              } else {
                vErrors.push(err26);
              }
              errors++;
            }
          }
        }
      } else {
        const err27 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err27];
        } else {
          vErrors.push(err27);
        }
        errors++;
      }
    }
    if (data.model !== void 0) {
      let data9 = data.model;
      if (data9 && typeof data9 == "object" && !Array.isArray(data9)) {
        if (data9.provider === void 0) {
          const err28 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/required", keyword: "required", params: { missingProperty: "provider" }, message: "must have required property 'provider'" };
          if (vErrors === null) {
            vErrors = [err28];
          } else {
            vErrors.push(err28);
          }
          errors++;
        }
        if (data9.baseUrl === void 0) {
          const err29 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/required", keyword: "required", params: { missingProperty: "baseUrl" }, message: "must have required property 'baseUrl'" };
          if (vErrors === null) {
            vErrors = [err29];
          } else {
            vErrors.push(err29);
          }
          errors++;
        }
        if (data9.model === void 0) {
          const err30 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/required", keyword: "required", params: { missingProperty: "model" }, message: "must have required property 'model'" };
          if (vErrors === null) {
            vErrors = [err30];
          } else {
            vErrors.push(err30);
          }
          errors++;
        }
        for (const key2 in data9) {
          if (!(key2 === "provider" || key2 === "baseUrl" || key2 === "model")) {
            const err31 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err31];
            } else {
              vErrors.push(err31);
            }
            errors++;
          }
        }
        if (data9.provider !== void 0) {
          if (typeof data9.provider !== "string") {
            const err32 = { instancePath: instancePath + "/model/provider", schemaPath: "#/$defs/ModelSettings/properties/provider/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err32];
            } else {
              vErrors.push(err32);
            }
            errors++;
          }
        }
        if (data9.baseUrl !== void 0) {
          if (typeof data9.baseUrl !== "string") {
            const err33 = { instancePath: instancePath + "/model/baseUrl", schemaPath: "#/$defs/ModelSettings/properties/baseUrl/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err33];
            } else {
              vErrors.push(err33);
            }
            errors++;
          }
        }
        if (data9.model !== void 0) {
          if (typeof data9.model !== "string") {
            const err34 = { instancePath: instancePath + "/model/model", schemaPath: "#/$defs/ModelSettings/properties/model/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err34];
            } else {
              vErrors.push(err34);
            }
            errors++;
          }
        }
      } else {
        const err35 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err35];
        } else {
          vErrors.push(err35);
        }
        errors++;
      }
    }
  } else {
    const err36 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err36];
    } else {
      vErrors.push(err36);
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
      if (!(data0 === "mock" || data0 === "native")) {
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
              if (!(key1 === "id" || key1 === "name" || key1 === "address" || key1 === "state" || key1 === "coreVersion" || key1 === "resourceVersion")) {
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
            if (data2.resourceVersion !== void 0) {
              let data8 = data2.resourceVersion;
              const _errs26 = errors;
              let valid6 = false;
              const _errs27 = errors;
              if (typeof data8 !== "string") {
                const err25 = { instancePath: instancePath + "/devices/" + i0 + "/resourceVersion", schemaPath: "#/$defs/Device/properties/resourceVersion/anyOf/0/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err25];
                } else {
                  vErrors.push(err25);
                }
                errors++;
              }
              var _valid1 = _errs27 === errors;
              valid6 = valid6 || _valid1;
              if (!valid6) {
                const _errs29 = errors;
                if (data8 !== null) {
                  const err26 = { instancePath: instancePath + "/devices/" + i0 + "/resourceVersion", schemaPath: "#/$defs/Device/properties/resourceVersion/anyOf/1/type", keyword: "type", params: { type: "null" }, message: "must be null" };
                  if (vErrors === null) {
                    vErrors = [err26];
                  } else {
                    vErrors.push(err26);
                  }
                  errors++;
                }
                var _valid1 = _errs29 === errors;
                valid6 = valid6 || _valid1;
              }
              if (!valid6) {
                const err27 = { instancePath: instancePath + "/devices/" + i0 + "/resourceVersion", schemaPath: "#/$defs/Device/properties/resourceVersion/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                if (vErrors === null) {
                  vErrors = [err27];
                } else {
                  vErrors.push(err27);
                }
                errors++;
              } else {
                errors = _errs26;
                if (vErrors !== null) {
                  if (_errs26) {
                    vErrors.length = _errs26;
                  } else {
                    vErrors = null;
                  }
                }
              }
            }
          } else {
            const err28 = { instancePath: instancePath + "/devices/" + i0, schemaPath: "#/$defs/Device/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err28];
            } else {
              vErrors.push(err28);
            }
            errors++;
          }
        }
      } else {
        const err29 = { instancePath: instancePath + "/devices", schemaPath: "#/properties/devices/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err29];
        } else {
          vErrors.push(err29);
        }
        errors++;
      }
    }
    if (data.plans !== void 0) {
      let data9 = data.plans;
      if (Array.isArray(data9)) {
        const len1 = data9.length;
        for (let i1 = 0; i1 < len1; i1++) {
          if (!validate11(data9[i1], { instancePath: instancePath + "/plans/" + i1, parentData: data9, parentDataProperty: i1, rootData })) {
            vErrors = vErrors === null ? validate11.errors : vErrors.concat(validate11.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err30 = { instancePath: instancePath + "/plans", schemaPath: "#/properties/plans/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err30];
        } else {
          vErrors.push(err30);
        }
        errors++;
      }
    }
    if (data.runs !== void 0) {
      let data11 = data.runs;
      if (Array.isArray(data11)) {
        const len2 = data11.length;
        for (let i2 = 0; i2 < len2; i2++) {
          let data12 = data11[i2];
          if (data12 && typeof data12 == "object" && !Array.isArray(data12)) {
            if (data12.id === void 0) {
              const err31 = { instancePath: instancePath + "/runs/" + i2, schemaPath: "#/$defs/Run/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
              if (vErrors === null) {
                vErrors = [err31];
              } else {
                vErrors.push(err31);
              }
              errors++;
            }
            if (data12.planId === void 0) {
              const err32 = { instancePath: instancePath + "/runs/" + i2, schemaPath: "#/$defs/Run/required", keyword: "required", params: { missingProperty: "planId" }, message: "must have required property 'planId'" };
              if (vErrors === null) {
                vErrors = [err32];
              } else {
                vErrors.push(err32);
              }
              errors++;
            }
            if (data12.deviceId === void 0) {
              const err33 = { instancePath: instancePath + "/runs/" + i2, schemaPath: "#/$defs/Run/required", keyword: "required", params: { missingProperty: "deviceId" }, message: "must have required property 'deviceId'" };
              if (vErrors === null) {
                vErrors = [err33];
              } else {
                vErrors.push(err33);
              }
              errors++;
            }
            if (data12.status === void 0) {
              const err34 = { instancePath: instancePath + "/runs/" + i2, schemaPath: "#/$defs/Run/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
              if (vErrors === null) {
                vErrors = [err34];
              } else {
                vErrors.push(err34);
              }
              errors++;
            }
            if (data12.progress === void 0) {
              const err35 = { instancePath: instancePath + "/runs/" + i2, schemaPath: "#/$defs/Run/required", keyword: "required", params: { missingProperty: "progress" }, message: "must have required property 'progress'" };
              if (vErrors === null) {
                vErrors = [err35];
              } else {
                vErrors.push(err35);
              }
              errors++;
            }
            if (data12.message === void 0) {
              const err36 = { instancePath: instancePath + "/runs/" + i2, schemaPath: "#/$defs/Run/required", keyword: "required", params: { missingProperty: "message" }, message: "must have required property 'message'" };
              if (vErrors === null) {
                vErrors = [err36];
              } else {
                vErrors.push(err36);
              }
              errors++;
            }
            if (data12.startedAt === void 0) {
              const err37 = { instancePath: instancePath + "/runs/" + i2, schemaPath: "#/$defs/Run/required", keyword: "required", params: { missingProperty: "startedAt" }, message: "must have required property 'startedAt'" };
              if (vErrors === null) {
                vErrors = [err37];
              } else {
                vErrors.push(err37);
              }
              errors++;
            }
            if (data12.finishedAt === void 0) {
              const err38 = { instancePath: instancePath + "/runs/" + i2, schemaPath: "#/$defs/Run/required", keyword: "required", params: { missingProperty: "finishedAt" }, message: "must have required property 'finishedAt'" };
              if (vErrors === null) {
                vErrors = [err38];
              } else {
                vErrors.push(err38);
              }
              errors++;
            }
            for (const key2 in data12) {
              if (!(key2 === "id" || key2 === "planId" || key2 === "deviceId" || key2 === "status" || key2 === "progress" || key2 === "message" || key2 === "startedAt" || key2 === "finishedAt")) {
                const err39 = { instancePath: instancePath + "/runs/" + i2, schemaPath: "#/$defs/Run/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err39];
                } else {
                  vErrors.push(err39);
                }
                errors++;
              }
            }
            if (data12.id !== void 0) {
              if (typeof data12.id !== "string") {
                const err40 = { instancePath: instancePath + "/runs/" + i2 + "/id", schemaPath: "#/$defs/Run/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err40];
                } else {
                  vErrors.push(err40);
                }
                errors++;
              }
            }
            if (data12.planId !== void 0) {
              if (typeof data12.planId !== "string") {
                const err41 = { instancePath: instancePath + "/runs/" + i2 + "/planId", schemaPath: "#/$defs/Run/properties/planId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err41];
                } else {
                  vErrors.push(err41);
                }
                errors++;
              }
            }
            if (data12.deviceId !== void 0) {
              if (typeof data12.deviceId !== "string") {
                const err42 = { instancePath: instancePath + "/runs/" + i2 + "/deviceId", schemaPath: "#/$defs/Run/properties/deviceId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err42];
                } else {
                  vErrors.push(err42);
                }
                errors++;
              }
            }
            if (data12.status !== void 0) {
              let data16 = data12.status;
              if (typeof data16 !== "string") {
                const err43 = { instancePath: instancePath + "/runs/" + i2 + "/status", schemaPath: "#/$defs/Run/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err43];
                } else {
                  vErrors.push(err43);
                }
                errors++;
              }
              if (!(data16 === "running" || data16 === "completed" || data16 === "failed" || data16 === "stopped")) {
                const err44 = { instancePath: instancePath + "/runs/" + i2 + "/status", schemaPath: "#/$defs/Run/properties/status/enum", keyword: "enum", params: { allowedValues: schema16.properties.status.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err44];
                } else {
                  vErrors.push(err44);
                }
                errors++;
              }
            }
            if (data12.progress !== void 0) {
              let data17 = data12.progress;
              if (!(typeof data17 == "number" && (!(data17 % 1) && !isNaN(data17)) && isFinite(data17))) {
                const err45 = { instancePath: instancePath + "/runs/" + i2 + "/progress", schemaPath: "#/$defs/Run/properties/progress/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err45];
                } else {
                  vErrors.push(err45);
                }
                errors++;
              }
              if (typeof data17 == "number" && isFinite(data17)) {
                if (data17 > 100 || isNaN(data17)) {
                  const err46 = { instancePath: instancePath + "/runs/" + i2 + "/progress", schemaPath: "#/$defs/Run/properties/progress/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
                  if (vErrors === null) {
                    vErrors = [err46];
                  } else {
                    vErrors.push(err46);
                  }
                  errors++;
                }
                if (data17 < 0 || isNaN(data17)) {
                  const err47 = { instancePath: instancePath + "/runs/" + i2 + "/progress", schemaPath: "#/$defs/Run/properties/progress/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err47];
                  } else {
                    vErrors.push(err47);
                  }
                  errors++;
                }
              }
            }
            if (data12.message !== void 0) {
              if (typeof data12.message !== "string") {
                const err48 = { instancePath: instancePath + "/runs/" + i2 + "/message", schemaPath: "#/$defs/Run/properties/message/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err48];
                } else {
                  vErrors.push(err48);
                }
                errors++;
              }
            }
            if (data12.startedAt !== void 0) {
              if (typeof data12.startedAt !== "string") {
                const err49 = { instancePath: instancePath + "/runs/" + i2 + "/startedAt", schemaPath: "#/$defs/Run/properties/startedAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err49];
                } else {
                  vErrors.push(err49);
                }
                errors++;
              }
            }
            if (data12.finishedAt !== void 0) {
              let data20 = data12.finishedAt;
              const _errs55 = errors;
              let valid13 = false;
              const _errs56 = errors;
              if (typeof data20 !== "string") {
                const err50 = { instancePath: instancePath + "/runs/" + i2 + "/finishedAt", schemaPath: "#/$defs/Run/properties/finishedAt/anyOf/0/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err50];
                } else {
                  vErrors.push(err50);
                }
                errors++;
              }
              var _valid2 = _errs56 === errors;
              valid13 = valid13 || _valid2;
              if (!valid13) {
                const _errs58 = errors;
                if (data20 !== null) {
                  const err51 = { instancePath: instancePath + "/runs/" + i2 + "/finishedAt", schemaPath: "#/$defs/Run/properties/finishedAt/anyOf/1/type", keyword: "type", params: { type: "null" }, message: "must be null" };
                  if (vErrors === null) {
                    vErrors = [err51];
                  } else {
                    vErrors.push(err51);
                  }
                  errors++;
                }
                var _valid2 = _errs58 === errors;
                valid13 = valid13 || _valid2;
              }
              if (!valid13) {
                const err52 = { instancePath: instancePath + "/runs/" + i2 + "/finishedAt", schemaPath: "#/$defs/Run/properties/finishedAt/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                if (vErrors === null) {
                  vErrors = [err52];
                } else {
                  vErrors.push(err52);
                }
                errors++;
              } else {
                errors = _errs55;
                if (vErrors !== null) {
                  if (_errs55) {
                    vErrors.length = _errs55;
                  } else {
                    vErrors = null;
                  }
                }
              }
            }
          } else {
            const err53 = { instancePath: instancePath + "/runs/" + i2, schemaPath: "#/$defs/Run/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err53];
            } else {
              vErrors.push(err53);
            }
            errors++;
          }
        }
      } else {
        const err54 = { instancePath: instancePath + "/runs", schemaPath: "#/properties/runs/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err54];
        } else {
          vErrors.push(err54);
        }
        errors++;
      }
    }
    if (data.updates !== void 0) {
      let data21 = data.updates;
      if (Array.isArray(data21)) {
        const len3 = data21.length;
        for (let i3 = 0; i3 < len3; i3++) {
          let data22 = data21[i3];
          if (data22 && typeof data22 == "object" && !Array.isArray(data22)) {
            if (data22.id === void 0) {
              const err55 = { instancePath: instancePath + "/updates/" + i3, schemaPath: "#/$defs/UpdateChannel/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
              if (vErrors === null) {
                vErrors = [err55];
              } else {
                vErrors.push(err55);
              }
              errors++;
            }
            if (data22.currentVersion === void 0) {
              const err56 = { instancePath: instancePath + "/updates/" + i3, schemaPath: "#/$defs/UpdateChannel/required", keyword: "required", params: { missingProperty: "currentVersion" }, message: "must have required property 'currentVersion'" };
              if (vErrors === null) {
                vErrors = [err56];
              } else {
                vErrors.push(err56);
              }
              errors++;
            }
            if (data22.latestVersion === void 0) {
              const err57 = { instancePath: instancePath + "/updates/" + i3, schemaPath: "#/$defs/UpdateChannel/required", keyword: "required", params: { missingProperty: "latestVersion" }, message: "must have required property 'latestVersion'" };
              if (vErrors === null) {
                vErrors = [err57];
              } else {
                vErrors.push(err57);
              }
              errors++;
            }
            if (data22.status === void 0) {
              const err58 = { instancePath: instancePath + "/updates/" + i3, schemaPath: "#/$defs/UpdateChannel/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
              if (vErrors === null) {
                vErrors = [err58];
              } else {
                vErrors.push(err58);
              }
              errors++;
            }
            if (data22.progress === void 0) {
              const err59 = { instancePath: instancePath + "/updates/" + i3, schemaPath: "#/$defs/UpdateChannel/required", keyword: "required", params: { missingProperty: "progress" }, message: "must have required property 'progress'" };
              if (vErrors === null) {
                vErrors = [err59];
              } else {
                vErrors.push(err59);
              }
              errors++;
            }
            if (data22.message === void 0) {
              const err60 = { instancePath: instancePath + "/updates/" + i3, schemaPath: "#/$defs/UpdateChannel/required", keyword: "required", params: { missingProperty: "message" }, message: "must have required property 'message'" };
              if (vErrors === null) {
                vErrors = [err60];
              } else {
                vErrors.push(err60);
              }
              errors++;
            }
            for (const key3 in data22) {
              if (!(key3 === "id" || key3 === "currentVersion" || key3 === "latestVersion" || key3 === "status" || key3 === "progress" || key3 === "message")) {
                const err61 = { instancePath: instancePath + "/updates/" + i3, schemaPath: "#/$defs/UpdateChannel/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err61];
                } else {
                  vErrors.push(err61);
                }
                errors++;
              }
            }
            if (data22.id !== void 0) {
              let data23 = data22.id;
              if (typeof data23 !== "string") {
                const err62 = { instancePath: instancePath + "/updates/" + i3 + "/id", schemaPath: "#/$defs/UpdateChannel/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err62];
                } else {
                  vErrors.push(err62);
                }
                errors++;
              }
              if (!(data23 === "app" || data23 === "core" || data23 === "resource")) {
                const err63 = { instancePath: instancePath + "/updates/" + i3 + "/id", schemaPath: "#/$defs/UpdateChannel/properties/id/enum", keyword: "enum", params: { allowedValues: schema17.properties.id.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err63];
                } else {
                  vErrors.push(err63);
                }
                errors++;
              }
            }
            if (data22.currentVersion !== void 0) {
              if (typeof data22.currentVersion !== "string") {
                const err64 = { instancePath: instancePath + "/updates/" + i3 + "/currentVersion", schemaPath: "#/$defs/UpdateChannel/properties/currentVersion/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err64];
                } else {
                  vErrors.push(err64);
                }
                errors++;
              }
            }
            if (data22.latestVersion !== void 0) {
              let data25 = data22.latestVersion;
              const _errs71 = errors;
              let valid18 = false;
              const _errs72 = errors;
              if (typeof data25 !== "string") {
                const err65 = { instancePath: instancePath + "/updates/" + i3 + "/latestVersion", schemaPath: "#/$defs/UpdateChannel/properties/latestVersion/anyOf/0/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err65];
                } else {
                  vErrors.push(err65);
                }
                errors++;
              }
              var _valid3 = _errs72 === errors;
              valid18 = valid18 || _valid3;
              if (!valid18) {
                const _errs74 = errors;
                if (data25 !== null) {
                  const err66 = { instancePath: instancePath + "/updates/" + i3 + "/latestVersion", schemaPath: "#/$defs/UpdateChannel/properties/latestVersion/anyOf/1/type", keyword: "type", params: { type: "null" }, message: "must be null" };
                  if (vErrors === null) {
                    vErrors = [err66];
                  } else {
                    vErrors.push(err66);
                  }
                  errors++;
                }
                var _valid3 = _errs74 === errors;
                valid18 = valid18 || _valid3;
              }
              if (!valid18) {
                const err67 = { instancePath: instancePath + "/updates/" + i3 + "/latestVersion", schemaPath: "#/$defs/UpdateChannel/properties/latestVersion/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
                if (vErrors === null) {
                  vErrors = [err67];
                } else {
                  vErrors.push(err67);
                }
                errors++;
              } else {
                errors = _errs71;
                if (vErrors !== null) {
                  if (_errs71) {
                    vErrors.length = _errs71;
                  } else {
                    vErrors = null;
                  }
                }
              }
            }
            if (data22.status !== void 0) {
              let data26 = data22.status;
              if (typeof data26 !== "string") {
                const err68 = { instancePath: instancePath + "/updates/" + i3 + "/status", schemaPath: "#/$defs/UpdateChannel/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err68];
                } else {
                  vErrors.push(err68);
                }
                errors++;
              }
              if (!(data26 === "idle" || data26 === "checking" || data26 === "available" || data26 === "downloading" || data26 === "staged" || data26 === "waiting_idle" || data26 === "active" || data26 === "failed")) {
                const err69 = { instancePath: instancePath + "/updates/" + i3 + "/status", schemaPath: "#/$defs/UpdateChannel/properties/status/enum", keyword: "enum", params: { allowedValues: schema17.properties.status.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err69];
                } else {
                  vErrors.push(err69);
                }
                errors++;
              }
            }
            if (data22.progress !== void 0) {
              let data27 = data22.progress;
              if (!(typeof data27 == "number" && (!(data27 % 1) && !isNaN(data27)) && isFinite(data27))) {
                const err70 = { instancePath: instancePath + "/updates/" + i3 + "/progress", schemaPath: "#/$defs/UpdateChannel/properties/progress/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err70];
                } else {
                  vErrors.push(err70);
                }
                errors++;
              }
              if (typeof data27 == "number" && isFinite(data27)) {
                if (data27 > 100 || isNaN(data27)) {
                  const err71 = { instancePath: instancePath + "/updates/" + i3 + "/progress", schemaPath: "#/$defs/UpdateChannel/properties/progress/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
                  if (vErrors === null) {
                    vErrors = [err71];
                  } else {
                    vErrors.push(err71);
                  }
                  errors++;
                }
                if (data27 < 0 || isNaN(data27)) {
                  const err72 = { instancePath: instancePath + "/updates/" + i3 + "/progress", schemaPath: "#/$defs/UpdateChannel/properties/progress/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err72];
                  } else {
                    vErrors.push(err72);
                  }
                  errors++;
                }
              }
            }
            if (data22.message !== void 0) {
              if (typeof data22.message !== "string") {
                const err73 = { instancePath: instancePath + "/updates/" + i3 + "/message", schemaPath: "#/$defs/UpdateChannel/properties/message/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err73];
                } else {
                  vErrors.push(err73);
                }
                errors++;
              }
            }
          } else {
            const err74 = { instancePath: instancePath + "/updates/" + i3, schemaPath: "#/$defs/UpdateChannel/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err74];
            } else {
              vErrors.push(err74);
            }
            errors++;
          }
        }
      } else {
        const err75 = { instancePath: instancePath + "/updates", schemaPath: "#/properties/updates/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err75];
        } else {
          vErrors.push(err75);
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
      let data30 = data.events;
      if (Array.isArray(data30)) {
        const len4 = data30.length;
        for (let i4 = 0; i4 < len4; i4++) {
          let data31 = data30[i4];
          if (data31 && typeof data31 == "object" && !Array.isArray(data31)) {
            if (data31.id === void 0) {
              const err76 = { instancePath: instancePath + "/events/" + i4, schemaPath: "#/$defs/Event/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
              if (vErrors === null) {
                vErrors = [err76];
              } else {
                vErrors.push(err76);
              }
              errors++;
            }
            if (data31.type === void 0) {
              const err77 = { instancePath: instancePath + "/events/" + i4, schemaPath: "#/$defs/Event/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
              if (vErrors === null) {
                vErrors = [err77];
              } else {
                vErrors.push(err77);
              }
              errors++;
            }
            if (data31.message === void 0) {
              const err78 = { instancePath: instancePath + "/events/" + i4, schemaPath: "#/$defs/Event/required", keyword: "required", params: { missingProperty: "message" }, message: "must have required property 'message'" };
              if (vErrors === null) {
                vErrors = [err78];
              } else {
                vErrors.push(err78);
              }
              errors++;
            }
            if (data31.createdAt === void 0) {
              const err79 = { instancePath: instancePath + "/events/" + i4, schemaPath: "#/$defs/Event/required", keyword: "required", params: { missingProperty: "createdAt" }, message: "must have required property 'createdAt'" };
              if (vErrors === null) {
                vErrors = [err79];
              } else {
                vErrors.push(err79);
              }
              errors++;
            }
            if (data31.data === void 0) {
              const err80 = { instancePath: instancePath + "/events/" + i4, schemaPath: "#/$defs/Event/required", keyword: "required", params: { missingProperty: "data" }, message: "must have required property 'data'" };
              if (vErrors === null) {
                vErrors = [err80];
              } else {
                vErrors.push(err80);
              }
              errors++;
            }
            for (const key4 in data31) {
              if (!(key4 === "id" || key4 === "type" || key4 === "message" || key4 === "createdAt" || key4 === "data")) {
                const err81 = { instancePath: instancePath + "/events/" + i4, schemaPath: "#/$defs/Event/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err81];
                } else {
                  vErrors.push(err81);
                }
                errors++;
              }
            }
            if (data31.id !== void 0) {
              let data32 = data31.id;
              if (!(typeof data32 == "number" && (!(data32 % 1) && !isNaN(data32)) && isFinite(data32))) {
                const err82 = { instancePath: instancePath + "/events/" + i4 + "/id", schemaPath: "#/$defs/Event/properties/id/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err82];
                } else {
                  vErrors.push(err82);
                }
                errors++;
              }
            }
            if (data31.type !== void 0) {
              if (typeof data31.type !== "string") {
                const err83 = { instancePath: instancePath + "/events/" + i4 + "/type", schemaPath: "#/$defs/Event/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err83];
                } else {
                  vErrors.push(err83);
                }
                errors++;
              }
            }
            if (data31.message !== void 0) {
              if (typeof data31.message !== "string") {
                const err84 = { instancePath: instancePath + "/events/" + i4 + "/message", schemaPath: "#/$defs/Event/properties/message/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err84];
                } else {
                  vErrors.push(err84);
                }
                errors++;
              }
            }
            if (data31.createdAt !== void 0) {
              if (typeof data31.createdAt !== "string") {
                const err85 = { instancePath: instancePath + "/events/" + i4 + "/createdAt", schemaPath: "#/$defs/Event/properties/createdAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err85];
                } else {
                  vErrors.push(err85);
                }
                errors++;
              }
            }
            if (data31.data !== void 0) {
              let data36 = data31.data;
              if (data36 && typeof data36 == "object" && !Array.isArray(data36)) {
              } else {
                const err86 = { instancePath: instancePath + "/events/" + i4 + "/data", schemaPath: "#/$defs/Event/properties/data/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err86];
                } else {
                  vErrors.push(err86);
                }
                errors++;
              }
            }
          } else {
            const err87 = { instancePath: instancePath + "/events/" + i4, schemaPath: "#/$defs/Event/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err87];
            } else {
              vErrors.push(err87);
            }
            errors++;
          }
        }
      } else {
        const err88 = { instancePath: instancePath + "/events", schemaPath: "#/properties/events/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err88];
        } else {
          vErrors.push(err88);
        }
        errors++;
      }
    }
  } else {
    const err89 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err89];
    } else {
      vErrors.push(err89);
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
      if (!func2.call(schema13.properties, key0)) {
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
      if (!(key0 === "autoConnect" || key0 === "autoUpdateCore" || key0 === "autoUpdateResource" || key0 === "minimizeToTray" || key0 === "theme" || key0 === "budgets" || key0 === "model")) {
        const err7 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.autoConnect !== void 0) {
      if (typeof data.autoConnect !== "boolean") {
        const err8 = { instancePath: instancePath + "/autoConnect", schemaPath: "#/properties/autoConnect/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.autoUpdateCore !== void 0) {
      if (typeof data.autoUpdateCore !== "boolean") {
        const err9 = { instancePath: instancePath + "/autoUpdateCore", schemaPath: "#/properties/autoUpdateCore/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.autoUpdateResource !== void 0) {
      if (typeof data.autoUpdateResource !== "boolean") {
        const err10 = { instancePath: instancePath + "/autoUpdateResource", schemaPath: "#/properties/autoUpdateResource/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
        }
        errors++;
      }
    }
    if (data.minimizeToTray !== void 0) {
      if (typeof data.minimizeToTray !== "boolean") {
        const err11 = { instancePath: instancePath + "/minimizeToTray", schemaPath: "#/properties/minimizeToTray/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.theme !== void 0) {
      let data4 = data.theme;
      if (typeof data4 !== "string") {
        const err12 = { instancePath: instancePath + "/theme", schemaPath: "#/properties/theme/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
      if (!(data4 === "dark" || data4 === "light" || data4 === "system")) {
        const err13 = { instancePath: instancePath + "/theme", schemaPath: "#/properties/theme/enum", keyword: "enum", params: { allowedValues: schema18.properties.theme.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
    if (data.budgets !== void 0) {
      let data5 = data.budgets;
      if (data5 && typeof data5 == "object" && !Array.isArray(data5)) {
        if (data5.originium === void 0) {
          const err14 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/required", keyword: "required", params: { missingProperty: "originium" }, message: "must have required property 'originium'" };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
        if (data5.medicine === void 0) {
          const err15 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/required", keyword: "required", params: { missingProperty: "medicine" }, message: "must have required property 'medicine'" };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
        if (data5.expedited === void 0) {
          const err16 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/required", keyword: "required", params: { missingProperty: "expedited" }, message: "must have required property 'expedited'" };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
        for (const key1 in data5) {
          if (!(key1 === "originium" || key1 === "medicine" || key1 === "expedited")) {
            const err17 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
        if (data5.originium !== void 0) {
          let data6 = data5.originium;
          if (!(typeof data6 == "number" && (!(data6 % 1) && !isNaN(data6)) && isFinite(data6))) {
            const err18 = { instancePath: instancePath + "/budgets/originium", schemaPath: "#/$defs/Budgets/properties/originium/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
          if (typeof data6 == "number" && isFinite(data6)) {
            if (data6 > 100 || isNaN(data6)) {
              const err19 = { instancePath: instancePath + "/budgets/originium", schemaPath: "#/$defs/Budgets/properties/originium/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
            if (data6 < 0 || isNaN(data6)) {
              const err20 = { instancePath: instancePath + "/budgets/originium", schemaPath: "#/$defs/Budgets/properties/originium/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err20];
              } else {
                vErrors.push(err20);
              }
              errors++;
            }
          }
        }
        if (data5.medicine !== void 0) {
          let data7 = data5.medicine;
          if (!(typeof data7 == "number" && (!(data7 % 1) && !isNaN(data7)) && isFinite(data7))) {
            const err21 = { instancePath: instancePath + "/budgets/medicine", schemaPath: "#/$defs/Budgets/properties/medicine/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err21];
            } else {
              vErrors.push(err21);
            }
            errors++;
          }
          if (typeof data7 == "number" && isFinite(data7)) {
            if (data7 > 100 || isNaN(data7)) {
              const err22 = { instancePath: instancePath + "/budgets/medicine", schemaPath: "#/$defs/Budgets/properties/medicine/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
              if (vErrors === null) {
                vErrors = [err22];
              } else {
                vErrors.push(err22);
              }
              errors++;
            }
            if (data7 < 0 || isNaN(data7)) {
              const err23 = { instancePath: instancePath + "/budgets/medicine", schemaPath: "#/$defs/Budgets/properties/medicine/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
          }
        }
        if (data5.expedited !== void 0) {
          let data8 = data5.expedited;
          if (!(typeof data8 == "number" && (!(data8 % 1) && !isNaN(data8)) && isFinite(data8))) {
            const err24 = { instancePath: instancePath + "/budgets/expedited", schemaPath: "#/$defs/Budgets/properties/expedited/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
          if (typeof data8 == "number" && isFinite(data8)) {
            if (data8 > 100 || isNaN(data8)) {
              const err25 = { instancePath: instancePath + "/budgets/expedited", schemaPath: "#/$defs/Budgets/properties/expedited/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
              if (vErrors === null) {
                vErrors = [err25];
              } else {
                vErrors.push(err25);
              }
              errors++;
            }
            if (data8 < 0 || isNaN(data8)) {
              const err26 = { instancePath: instancePath + "/budgets/expedited", schemaPath: "#/$defs/Budgets/properties/expedited/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err26];
              } else {
                vErrors.push(err26);
              }
              errors++;
            }
          }
        }
      } else {
        const err27 = { instancePath: instancePath + "/budgets", schemaPath: "#/$defs/Budgets/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err27];
        } else {
          vErrors.push(err27);
        }
        errors++;
      }
    }
    if (data.model !== void 0) {
      let data9 = data.model;
      if (data9 && typeof data9 == "object" && !Array.isArray(data9)) {
        if (data9.provider === void 0) {
          const err28 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/required", keyword: "required", params: { missingProperty: "provider" }, message: "must have required property 'provider'" };
          if (vErrors === null) {
            vErrors = [err28];
          } else {
            vErrors.push(err28);
          }
          errors++;
        }
        if (data9.baseUrl === void 0) {
          const err29 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/required", keyword: "required", params: { missingProperty: "baseUrl" }, message: "must have required property 'baseUrl'" };
          if (vErrors === null) {
            vErrors = [err29];
          } else {
            vErrors.push(err29);
          }
          errors++;
        }
        if (data9.model === void 0) {
          const err30 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/required", keyword: "required", params: { missingProperty: "model" }, message: "must have required property 'model'" };
          if (vErrors === null) {
            vErrors = [err30];
          } else {
            vErrors.push(err30);
          }
          errors++;
        }
        for (const key2 in data9) {
          if (!(key2 === "provider" || key2 === "baseUrl" || key2 === "model")) {
            const err31 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err31];
            } else {
              vErrors.push(err31);
            }
            errors++;
          }
        }
        if (data9.provider !== void 0) {
          if (typeof data9.provider !== "string") {
            const err32 = { instancePath: instancePath + "/model/provider", schemaPath: "#/$defs/ModelSettings/properties/provider/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err32];
            } else {
              vErrors.push(err32);
            }
            errors++;
          }
        }
        if (data9.baseUrl !== void 0) {
          if (typeof data9.baseUrl !== "string") {
            const err33 = { instancePath: instancePath + "/model/baseUrl", schemaPath: "#/$defs/ModelSettings/properties/baseUrl/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err33];
            } else {
              vErrors.push(err33);
            }
            errors++;
          }
        }
        if (data9.model !== void 0) {
          if (typeof data9.model !== "string") {
            const err34 = { instancePath: instancePath + "/model/model", schemaPath: "#/$defs/ModelSettings/properties/model/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err34];
            } else {
              vErrors.push(err34);
            }
            errors++;
          }
        }
      } else {
        const err35 = { instancePath: instancePath + "/model", schemaPath: "#/$defs/ModelSettings/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err35];
        } else {
          vErrors.push(err35);
        }
        errors++;
      }
    }
  } else {
    const err36 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err36];
    } else {
      vErrors.push(err36);
    }
    errors++;
  }
  validate16.errors = vErrors;
  return errors === 0;
}
export {
  validatePlan,
  validateSettings,
  validateSnapshot
};
