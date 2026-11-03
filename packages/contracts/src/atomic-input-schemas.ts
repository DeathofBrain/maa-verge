/* Generated from packages/contracts/schemas. Run pnpm contracts:generate. Do not edit. */
export const atomicInputSchemas: Record<string, Record<string, unknown>> = {
  "operation.frame": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "operation.click": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "frameId",
      "x",
      "y"
    ],
    "properties": {
      "frameId": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "x": {
        "type": "integer",
        "minimum": 0,
        "maximum": 8191
      },
      "y": {
        "type": "integer",
        "minimum": 0,
        "maximum": 8191
      }
    }
  },
  "operation.swipe": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "frameId",
      "x1",
      "y1",
      "x2",
      "y2"
    ],
    "properties": {
      "frameId": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "x1": {
        "type": "integer",
        "minimum": 0,
        "maximum": 8191
      },
      "y1": {
        "type": "integer",
        "minimum": 0,
        "maximum": 8191
      },
      "x2": {
        "type": "integer",
        "minimum": 0,
        "maximum": 8191
      },
      "y2": {
        "type": "integer",
        "minimum": 0,
        "maximum": 8191
      },
      "durationMs": {
        "type": "integer",
        "minimum": 100,
        "maximum": 2000
      },
      "profile": {
        "enum": [
          "drag",
          "navigation"
        ]
      },
      "compensationDirection": {
        "enum": [
          "none",
          "up",
          "down",
          "left",
          "right"
        ]
      }
    }
  },
  "operation.press_key": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "frameId",
      "key"
    ],
    "properties": {
      "frameId": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "key": {
        "enum": [
          "back",
          "escape"
        ]
      }
    }
  },
  "operation.long_press": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "frameId",
      "x",
      "y",
      "durationMs"
    ],
    "properties": {
      "frameId": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "x": {
        "type": "integer",
        "minimum": 0,
        "maximum": 8191
      },
      "y": {
        "type": "integer",
        "minimum": 0,
        "maximum": 8191
      },
      "durationMs": {
        "type": "integer",
        "minimum": 1,
        "maximum": 10000
      }
    }
  },
  "operation.drag": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "frameId",
      "x1",
      "y1",
      "x2",
      "y2",
      "durationMs"
    ],
    "properties": {
      "frameId": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "x1": {
        "type": "integer",
        "minimum": 0,
        "maximum": 8191
      },
      "y1": {
        "type": "integer",
        "minimum": 0,
        "maximum": 8191
      },
      "x2": {
        "type": "integer",
        "minimum": 0,
        "maximum": 8191
      },
      "y2": {
        "type": "integer",
        "minimum": 0,
        "maximum": 8191
      },
      "durationMs": {
        "type": "integer",
        "minimum": 1,
        "maximum": 10000
      }
    }
  },
  "operation.recognize": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "frameId",
      "kind"
    ],
    "properties": {
      "kind": {
        "enum": [
          "ocr",
          "template",
          "color"
        ]
      },
      "roi": {
        "type": "array",
        "minItems": 4,
        "maxItems": 4,
        "items": [
          {
            "type": "integer",
            "minimum": 0,
            "maximum": 8191
          },
          {
            "type": "integer",
            "minimum": 0,
            "maximum": 8191
          },
          {
            "type": "integer",
            "minimum": 1,
            "maximum": 8192
          },
          {
            "type": "integer",
            "minimum": 1,
            "maximum": 8192
          }
        ],
        "additionalItems": false
      },
      "threshold": {
        "type": "number",
        "minimum": 0,
        "maximum": 1
      },
      "method": {
        "enum": [
          5,
          40,
          "RGBCount"
        ]
      },
      "onlyRec": {
        "type": "boolean"
      },
      "replace": {
        "type": "array",
        "maxItems": 256,
        "items": {
          "type": "array",
          "minItems": 2,
          "maxItems": 2,
          "items": {
            "type": "string",
            "maxLength": 512
          }
        }
      },
      "lower": {
        "type": "array",
        "minItems": 3,
        "maxItems": 3,
        "items": [
          {
            "type": "integer",
            "minimum": 0,
            "maximum": 179
          },
          {
            "type": "integer",
            "minimum": 0,
            "maximum": 255
          },
          {
            "type": "integer",
            "minimum": 0,
            "maximum": 255
          }
        ],
        "additionalItems": false
      },
      "upper": {
        "type": "array",
        "minItems": 3,
        "maxItems": 3,
        "items": [
          {
            "type": "integer",
            "minimum": 0,
            "maximum": 179
          },
          {
            "type": "integer",
            "minimum": 0,
            "maximum": 255
          },
          {
            "type": "integer",
            "minimum": 0,
            "maximum": 255
          }
        ],
        "additionalItems": false
      },
      "count": {
        "type": "integer",
        "minimum": 1,
        "maximum": 16777216
      },
      "connected": {
        "type": "boolean"
      },
      "greenMask": {
        "type": "boolean"
      },
      "referenceSize": {
        "type": "array",
        "minItems": 2,
        "maxItems": 2,
        "items": {
          "type": "integer",
          "minimum": 1,
          "maximum": 8192
        }
      },
      "maskRange": {
        "type": "array",
        "minItems": 2,
        "maxItems": 2,
        "items": {
          "type": "integer",
          "minimum": 0,
          "maximum": 255
        },
        "enum": [
          [
            1,
            255
          ],
          [
            100,
            255
          ]
        ]
      },
      "frameId": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "templateId": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200,
        "pattern": "^(?!\\/)(?!.*(?:^|\\/)\\.{1,2}(?:\\/|$))(?!.*[\\\\:\\u0000-\\u001f\\u007f])[^/]+(?:\\/[^/]+)*$"
      },
      "pureColor": {
        "const": true
      },
      "colorScales": {
        "type": "array",
        "minItems": 1,
        "maxItems": 16,
        "items": {
          "type": "array",
          "minItems": 2,
          "maxItems": 2,
          "items": {
            "type": "array",
            "minItems": 3,
            "maxItems": 3,
            "items": {
              "type": "integer",
              "minimum": 0,
              "maximum": 255
            }
          }
        }
      },
      "colorWithClose": {
        "type": "boolean"
      },
      "nmsDistance": {
        "type": "integer",
        "minimum": 0,
        "maximum": 16384
      }
    },
    "allOf": [
      {
        "if": {
          "properties": {
            "kind": {
              "const": "ocr"
            }
          }
        },
        "then": {
          "not": {
            "anyOf": [
              {
                "required": [
                  "method"
                ],
                "properties": {
                  "method": {}
                }
              },
              {
                "required": [
                  "templateId"
                ],
                "properties": {
                  "templateId": {}
                }
              },
              {
                "required": [
                  "maskRange"
                ],
                "properties": {
                  "maskRange": {}
                }
              },
              {
                "required": [
                  "greenMask"
                ],
                "properties": {
                  "greenMask": {}
                }
              },
              {
                "required": [
                  "lower"
                ],
                "properties": {
                  "lower": {}
                }
              },
              {
                "required": [
                  "upper"
                ],
                "properties": {
                  "upper": {}
                }
              },
              {
                "required": [
                  "count"
                ],
                "properties": {
                  "count": {}
                }
              },
              {
                "required": [
                  "connected"
                ],
                "properties": {
                  "connected": {}
                }
              },
              {
                "required": [
                  "pureColor"
                ],
                "properties": {
                  "pureColor": {}
                }
              },
              {
                "required": [
                  "colorScales"
                ],
                "properties": {
                  "colorScales": {}
                }
              },
              {
                "required": [
                  "colorWithClose"
                ],
                "properties": {
                  "colorWithClose": {}
                }
              },
              {
                "required": [
                  "nmsDistance"
                ],
                "properties": {
                  "nmsDistance": {}
                }
              }
            ]
          },
          "allOf": [
            {
              "if": {
                "properties": {
                  "onlyRec": {
                    "const": true
                  }
                },
                "required": [
                  "onlyRec"
                ]
              },
              "then": {
                "required": [
                  "roi"
                ],
                "properties": {
                  "roi": {}
                }
              }
            }
          ]
        }
      },
      {
        "if": {
          "properties": {
            "kind": {
              "const": "template"
            }
          }
        },
        "then": {
          "required": [
            "templateId"
          ],
          "properties": {
            "method": {
              "enum": [
                5,
                "RGBCount"
              ]
            },
            "templateId": {}
          },
          "not": {
            "anyOf": [
              {
                "required": [
                  "onlyRec"
                ],
                "properties": {
                  "onlyRec": {}
                }
              },
              {
                "required": [
                  "replace"
                ],
                "properties": {
                  "replace": {}
                }
              },
              {
                "required": [
                  "lower"
                ],
                "properties": {
                  "lower": {}
                }
              },
              {
                "required": [
                  "upper"
                ],
                "properties": {
                  "upper": {}
                }
              },
              {
                "required": [
                  "count"
                ],
                "properties": {
                  "count": {}
                }
              },
              {
                "required": [
                  "connected"
                ],
                "properties": {
                  "connected": {}
                }
              }
            ]
          },
          "allOf": [
            {
              "if": {
                "required": [
                  "maskRange"
                ],
                "properties": {
                  "maskRange": {}
                }
              },
              "then": {
                "not": {
                  "required": [
                    "greenMask"
                  ],
                  "properties": {
                    "greenMask": {}
                  }
                }
              }
            },
            {
              "if": {
                "required": [
                  "method"
                ],
                "properties": {
                  "method": {
                    "const": "RGBCount"
                  }
                }
              },
              "then": {
                "required": [
                  "pureColor",
                  "colorScales"
                ],
                "properties": {
                  "pureColor": {
                    "const": true
                  },
                  "colorScales": {}
                },
                "not": {
                  "anyOf": [
                    {
                      "required": [
                        "maskRange"
                      ],
                      "properties": {
                        "maskRange": {}
                      }
                    },
                    {
                      "required": [
                        "greenMask"
                      ],
                      "properties": {
                        "greenMask": {}
                      }
                    }
                  ]
                }
              },
              "else": {
                "not": {
                  "anyOf": [
                    {
                      "required": [
                        "pureColor"
                      ],
                      "properties": {
                        "pureColor": {}
                      }
                    },
                    {
                      "required": [
                        "colorScales"
                      ],
                      "properties": {
                        "colorScales": {}
                      }
                    },
                    {
                      "required": [
                        "colorWithClose"
                      ],
                      "properties": {
                        "colorWithClose": {}
                      }
                    },
                    {
                      "required": [
                        "nmsDistance"
                      ],
                      "properties": {
                        "nmsDistance": {}
                      }
                    }
                  ]
                }
              }
            }
          ]
        }
      },
      {
        "if": {
          "properties": {
            "kind": {
              "const": "color"
            }
          }
        },
        "then": {
          "required": [
            "method",
            "lower",
            "upper"
          ],
          "properties": {
            "method": {
              "const": 40
            },
            "lower": {},
            "upper": {}
          },
          "not": {
            "anyOf": [
              {
                "required": [
                  "threshold"
                ],
                "properties": {
                  "threshold": {}
                }
              },
              {
                "required": [
                  "onlyRec"
                ],
                "properties": {
                  "onlyRec": {}
                }
              },
              {
                "required": [
                  "replace"
                ],
                "properties": {
                  "replace": {}
                }
              },
              {
                "required": [
                  "templateId"
                ],
                "properties": {
                  "templateId": {}
                }
              },
              {
                "required": [
                  "maskRange"
                ],
                "properties": {
                  "maskRange": {}
                }
              },
              {
                "required": [
                  "greenMask"
                ],
                "properties": {
                  "greenMask": {}
                }
              },
              {
                "required": [
                  "pureColor"
                ],
                "properties": {
                  "pureColor": {}
                }
              },
              {
                "required": [
                  "colorScales"
                ],
                "properties": {
                  "colorScales": {}
                }
              },
              {
                "required": [
                  "colorWithClose"
                ],
                "properties": {
                  "colorWithClose": {}
                }
              },
              {
                "required": [
                  "nmsDistance"
                ],
                "properties": {
                  "nmsDistance": {}
                }
              }
            ]
          }
        }
      }
    ]
  },
  "observation.frame": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "observation.base": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "observation.operators": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "observation.overview": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "observation.training": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.infrast.enter_overview": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.infrast.read_room": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "facility",
      "room"
    ],
    "properties": {
      "facility": {
        "enum": [
          "Mfg",
          "Trade",
          "Power",
          "Control",
          "Reception",
          "Office",
          "Dorm",
          "Processing",
          "Training",
          "Recycle"
        ]
      },
      "room": {
        "type": "integer",
        "minimum": 1,
        "maximum": 9
      },
      "position": {
        "type": "string",
        "minLength": 1,
        "maxLength": 32
      },
      "route": {
        "enum": [
          "overview",
          "room"
        ]
      }
    }
  },
  "game.infrast.set_room": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "facility",
      "room"
    ],
    "properties": {
      "facility": {
        "enum": [
          "Mfg",
          "Trade",
          "Power",
          "Control",
          "Reception",
          "Office",
          "Dorm",
          "Processing",
          "Training",
          "Recycle"
        ]
      },
      "room": {
        "type": "integer",
        "minimum": 1,
        "maximum": 9
      },
      "position": {
        "type": "string",
        "minLength": 1,
        "maxLength": 32
      },
      "operators": {
        "type": "array",
        "maxItems": 5,
        "uniqueItems": true,
        "items": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        }
      },
      "trainee": {
        "type": "string",
        "minLength": 1,
        "maxLength": 100
      },
      "assistant": {
        "type": "string",
        "minLength": 1,
        "maxLength": 100
      }
    }
  },
  "workflow.infrast.queue_rotate": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "expectedRooms": {
        "type": "array",
        "minItems": 1,
        "maxItems": 32,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "facility",
            "room"
          ],
          "properties": {
            "facility": {
              "enum": [
                "Mfg",
                "Trade",
                "Power",
                "Control",
                "Reception",
                "Office",
                "Dorm",
                "Processing",
                "Training",
                "Recycle"
              ]
            },
            "room": {
              "type": "integer",
              "minimum": 1,
              "maximum": 9
            },
            "position": {
              "type": "string",
              "minLength": 1,
              "maxLength": 32
            },
            "operators": {
              "type": "array",
              "maxItems": 5,
              "uniqueItems": true,
              "items": {
                "type": "string",
                "minLength": 1,
                "maxLength": 100
              }
            },
            "trainee": {
              "type": "string",
              "minLength": 1,
              "maxLength": 100
            },
            "assistant": {
              "type": "string",
              "minLength": 1,
              "maxLength": 100
            }
          }
        }
      }
    }
  },
  "workflow.infrast.overview_shift": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "rooms"
    ],
    "properties": {
      "rooms": {
        "type": "array",
        "minItems": 1,
        "maxItems": 32,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "facility",
            "room"
          ],
          "properties": {
            "facility": {
              "enum": [
                "Mfg",
                "Trade",
                "Power",
                "Control",
                "Reception",
                "Office",
                "Dorm",
                "Processing",
                "Training",
                "Recycle"
              ]
            },
            "room": {
              "type": "integer",
              "minimum": 1,
              "maximum": 9
            },
            "position": {
              "type": "string",
              "minLength": 1,
              "maxLength": 32
            },
            "operators": {
              "type": "array",
              "maxItems": 5,
              "uniqueItems": true,
              "items": {
                "type": "string",
                "minLength": 1,
                "maxLength": 100
              }
            },
            "trainee": {
              "type": "string",
              "minLength": 1,
              "maxLength": 100
            },
            "assistant": {
              "type": "string",
              "minLength": 1,
              "maxLength": 100
            }
          }
        }
      }
    }
  },
  "workflow.infrast.room_shift": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "rooms"
    ],
    "properties": {
      "rooms": {
        "type": "array",
        "minItems": 1,
        "maxItems": 32,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "facility",
            "room"
          ],
          "properties": {
            "facility": {
              "enum": [
                "Mfg",
                "Trade",
                "Power",
                "Control",
                "Reception",
                "Office",
                "Dorm",
                "Processing",
                "Training",
                "Recycle"
              ]
            },
            "room": {
              "type": "integer",
              "minimum": 1,
              "maximum": 9
            },
            "position": {
              "type": "string",
              "minLength": 1,
              "maxLength": 32
            },
            "operators": {
              "type": "array",
              "maxItems": 5,
              "uniqueItems": true,
              "items": {
                "type": "string",
                "minLength": 1,
                "maxLength": 100
              }
            },
            "trainee": {
              "type": "string",
              "minLength": 1,
              "maxLength": 100
            },
            "assistant": {
              "type": "string",
              "minLength": 1,
              "maxLength": 100
            }
          }
        }
      }
    }
  },
  "workflow.infrast.trim": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "composite.match": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "profile": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "frame": {
        "description": "使用 current 在本次根 Pipeline 内截图，或传入同根且未过期的帧引用；显式引用不会自动刷新。",
        "default": "current",
        "oneOf": [
          {
            "type": "string",
            "const": "current"
          },
          {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "frameId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              },
              "width": {
                "type": "integer",
                "minimum": 1,
                "maximum": 8192
              },
              "height": {
                "type": "integer",
                "minimum": 1,
                "maximum": 8192
              },
              "data": {
                "type": "string",
                "minLength": 1,
                "maxLength": 4183384
              },
              "capturedAt": {
                "type": "string",
                "minLength": 1,
                "maxLength": 40
              },
              "deviceId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              },
              "mimeType": {
                "const": "image/png"
              },
              "canControl": {
                "type": "boolean"
              },
              "latencyMs": {
                "description": "Application-service duration of the native frame request, including image retrieval and transport.",
                "type": "number",
                "minimum": 0
              },
              "engine": {
                "const": "maafw"
              },
              "sessionId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              },
              "resourceGeneration": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              },
              "coordinateSpace": {
                "const": "frame"
              },
              "fresh": {
                "type": "boolean"
              }
            },
            "required": [
              "frameId",
              "width",
              "height"
            ]
          }
        ]
      },
      "roi": {
        "type": "array",
        "minItems": 4,
        "maxItems": 4,
        "items": {
          "type": "number",
          "minimum": 0,
          "maximum": 8192
        }
      },
      "rule": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      }
    },
    "required": [
      "rule"
    ]
  },
  "composite.texts": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "profile": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "frame": {
        "description": "使用 current 在本次根 Pipeline 内截图，或传入同根且未过期的帧引用；显式引用不会自动刷新。",
        "default": "current",
        "oneOf": [
          {
            "type": "string",
            "const": "current"
          },
          {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "frameId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              },
              "width": {
                "type": "integer",
                "minimum": 1,
                "maximum": 8192
              },
              "height": {
                "type": "integer",
                "minimum": 1,
                "maximum": 8192
              },
              "data": {
                "type": "string",
                "minLength": 1,
                "maxLength": 4183384
              },
              "capturedAt": {
                "type": "string",
                "minLength": 1,
                "maxLength": 40
              },
              "deviceId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              },
              "mimeType": {
                "const": "image/png"
              },
              "canControl": {
                "type": "boolean"
              },
              "latencyMs": {
                "description": "Application-service duration of the native frame request, including image retrieval and transport.",
                "type": "number",
                "minimum": 0
              },
              "engine": {
                "const": "maafw"
              },
              "sessionId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              },
              "resourceGeneration": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              },
              "coordinateSpace": {
                "const": "frame"
              },
              "fresh": {
                "type": "boolean"
              }
            },
            "required": [
              "frameId",
              "width",
              "height"
            ]
          }
        ]
      },
      "roi": {
        "type": "array",
        "minItems": 4,
        "maxItems": 4,
        "items": {
          "type": "number",
          "minimum": 0,
          "maximum": 8192
        }
      }
    },
    "required": []
  },
  "composite.click_box": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "profile": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "frame": {
        "description": "使用 current 在本次根 Pipeline 内截图，或传入同根且未过期的帧引用；显式引用不会自动刷新。",
        "default": "current",
        "oneOf": [
          {
            "type": "string",
            "const": "current"
          },
          {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "frameId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              },
              "width": {
                "type": "integer",
                "minimum": 1,
                "maximum": 8192
              },
              "height": {
                "type": "integer",
                "minimum": 1,
                "maximum": 8192
              },
              "data": {
                "type": "string",
                "minLength": 1,
                "maxLength": 4183384
              },
              "capturedAt": {
                "type": "string",
                "minLength": 1,
                "maxLength": 40
              },
              "deviceId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              },
              "mimeType": {
                "const": "image/png"
              },
              "canControl": {
                "type": "boolean"
              },
              "latencyMs": {
                "description": "Application-service duration of the native frame request, including image retrieval and transport.",
                "type": "number",
                "minimum": 0
              },
              "engine": {
                "const": "maafw"
              },
              "sessionId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              },
              "resourceGeneration": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              },
              "coordinateSpace": {
                "const": "frame"
              },
              "fresh": {
                "type": "boolean"
              }
            },
            "required": [
              "frameId",
              "width",
              "height"
            ]
          }
        ]
      },
      "roi": {
        "type": "array",
        "minItems": 4,
        "maxItems": 4,
        "items": {
          "type": "number",
          "minimum": 0,
          "maximum": 8192
        }
      },
      "box": {
        "type": "array",
        "minItems": 4,
        "maxItems": 4,
        "items": {
          "type": "number",
          "minimum": 0,
          "maximum": 8192
        }
      }
    },
    "required": [
      "frame",
      "box"
    ]
  },
  "composite.swipe": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "profile": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "frame": {
        "description": "使用 current 在本次根 Pipeline 内截图，或传入同根且未过期的帧引用；显式引用不会自动刷新。",
        "default": "current",
        "oneOf": [
          {
            "type": "string",
            "const": "current"
          },
          {
            "type": "object",
            "additionalProperties": false,
            "properties": {
              "frameId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              },
              "width": {
                "type": "integer",
                "minimum": 1,
                "maximum": 8192
              },
              "height": {
                "type": "integer",
                "minimum": 1,
                "maximum": 8192
              },
              "data": {
                "type": "string",
                "minLength": 1,
                "maxLength": 4183384
              },
              "capturedAt": {
                "type": "string",
                "minLength": 1,
                "maxLength": 40
              },
              "deviceId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              },
              "mimeType": {
                "const": "image/png"
              },
              "canControl": {
                "type": "boolean"
              },
              "latencyMs": {
                "description": "Application-service duration of the native frame request, including image retrieval and transport.",
                "type": "number",
                "minimum": 0
              },
              "engine": {
                "const": "maafw"
              },
              "sessionId": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              },
              "resourceGeneration": {
                "type": "string",
                "minLength": 1,
                "maxLength": 200
              },
              "coordinateSpace": {
                "const": "frame"
              },
              "fresh": {
                "type": "boolean"
              }
            },
            "required": [
              "frameId",
              "width",
              "height"
            ]
          }
        ]
      },
      "roi": {
        "type": "array",
        "minItems": 4,
        "maxItems": 4,
        "items": {
          "type": "number",
          "minimum": 0,
          "maximum": 8192
        }
      },
      "from": {
        "type": "array",
        "minItems": 2,
        "maxItems": 2,
        "items": {
          "type": "number",
          "minimum": 0,
          "maximum": 8192
        }
      },
      "to": {
        "type": "array",
        "minItems": 2,
        "maxItems": 2,
        "items": {
          "type": "number",
          "minimum": 0,
          "maximum": 8192
        }
      },
      "durationMs": {
        "type": "integer",
        "minimum": 100,
        "maximum": 2000
      }
    },
    "required": [
      "frame",
      "from",
      "to"
    ]
  },
  "composite.press_key": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "profile": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "key": {
        "enum": [
          "back",
          "escape"
        ]
      }
    },
    "required": [
      "key"
    ]
  },
  "composite.click_rule": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "profile": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "rule": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "optional": {
        "type": "boolean"
      }
    },
    "required": [
      "rule"
    ]
  },
  "composite.click_first": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "profile": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "rules": {
        "type": "array",
        "minItems": 1,
        "maxItems": 32,
        "items": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        }
      },
      "fallbackAction": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      }
    },
    "required": [
      "rules"
    ]
  },
  "composite.action": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "profile": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "action": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      }
    },
    "required": [
      "action"
    ]
  },
  "composite.delay": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "profile": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "ms": {
        "type": "integer",
        "minimum": 0,
        "maximum": 90000
      }
    },
    "required": [
      "ms"
    ]
  },
  "composite.assert_hit": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "profile": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "rule": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "message": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "unknown": {
        "type": "boolean"
      }
    },
    "required": [
      "rule"
    ]
  },
  "composite.assert_missing": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "profile": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "rule": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "message": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "unknown": {
        "type": "boolean"
      }
    },
    "required": [
      "rule"
    ]
  },
  "composite.wait_until": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "profile": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "rule": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "expected": {
        "type": "boolean"
      },
      "timeoutMs": {
        "type": "integer",
        "minimum": 1,
        "maximum": 90000
      },
      "pollMs": {
        "type": "integer",
        "minimum": 1,
        "maximum": 5000
      }
    },
    "required": [
      "rule",
      "timeoutMs"
    ]
  },
  "observation.startup": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.startup.login_step": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "workflow.startup.login": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "observation.fight": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.fight.enable_agent": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.fight.prepare": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "allowSanityDialog": {
        "type": "boolean"
      },
      "reusePrepared": {
        "type": "boolean"
      },
      "series": {
        "type": "integer",
        "minimum": 1,
        "maximum": 6
      }
    },
    "required": []
  },
  "game.fight.start": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.fight.read_result": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {
      "series": {
        "type": "integer",
        "minimum": 1,
        "maximum": 6
      }
    }
  },
  "game.fight.dismiss_result": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "observation.recruit": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.recruit.enter": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.recruit.collect_finished": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.recruit.skip_reveal": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.recruit.read_result": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "workflow.recruit.collect_one": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "observation.mall": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.mall.enter": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.mall.collect_credit": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "workflow.mall.collect_credit": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "observation.award": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.award.enter": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.award.select_daily": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.award.select_weekly": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.award.claim_current": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.award.close_reward": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "workflow.award.daily_weekly": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "observation.inventory.depot": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "observation.inventory.operators": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.inventory.enter_depot": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.inventory.enter_operators": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.fight.wait_result": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "timeoutMs": {
        "type": "integer",
        "minimum": 1000,
        "maximum": 90000
      },
      "pollMs": {
        "type": "integer",
        "minimum": 100,
        "maximum": 5000
      },
      "allowPending": {
        "type": "boolean"
      },
      "series": {
        "type": "integer",
        "minimum": 1,
        "maximum": 6
      }
    },
    "required": []
  },
  "workflow.fight.current_stage": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "times": {
        "type": "integer",
        "minimum": 1,
        "maximum": 20
      },
      "timeoutMs": {
        "type": "integer",
        "minimum": 1000,
        "maximum": 90000
      }
    },
    "required": []
  },
  "game.mall.buy_current": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "maxCredit": {
        "type": "integer",
        "minimum": 0,
        "maximum": 1000
      }
    },
    "required": [
      "maxCredit"
    ]
  },
  "game.infrast.prepare_roster": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "target": {
        "$ref": "#/$defs/AtomicRoomTargetInput"
      },
      "route": {
        "enum": [
          "overview",
          "room"
        ]
      },
      "role": {
        "enum": [
          "normal",
          "trainee",
          "assistant"
        ]
      },
      "operators": {
        "type": "array",
        "maxItems": 5,
        "uniqueItems": true,
        "items": {
          "type": "string",
          "minLength": 1,
          "maxLength": 200
        }
      },
      "name": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      }
    },
    "required": [
      "target",
      "route",
      "role"
    ],
    "allOf": [
      {
        "if": {
          "properties": {
            "role": {
              "const": "trainee"
            }
          },
          "required": [
            "role"
          ]
        },
        "then": {
          "required": [
            "name"
          ],
          "properties": {
            "name": {
              "type": "string"
            }
          }
        },
        "else": {
          "required": [
            "operators"
          ],
          "properties": {
            "operators": {
              "type": "array"
            }
          }
        }
      }
    ]
  },
  "game.infrast.confirm": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "prepared": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "target": {
            "$ref": "#/$defs/AtomicRoomTargetInput"
          },
          "route": {
            "enum": [
              "overview",
              "room"
            ]
          },
          "role": {
            "enum": [
              "normal",
              "trainee",
              "assistant"
            ]
          },
          "before": {
            "type": "object",
            "additionalProperties": true
          },
          "selected": {
            "type": "object",
            "additionalProperties": true
          },
          "selectionAttempt": {
            "type": "object",
            "additionalProperties": true
          }
        },
        "required": [
          "target",
          "route",
          "role",
          "selected"
        ]
      }
    },
    "required": [
      "prepared"
    ]
  },
  "game.infrast.verify_room": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "request": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "target": {
            "$ref": "#/$defs/AtomicRoomTargetInput"
          },
          "route": {
            "enum": [
              "overview",
              "room"
            ]
          },
          "role": {
            "enum": [
              "normal",
              "trainee",
              "assistant"
            ]
          },
          "operators": {
            "type": "array",
            "maxItems": 5,
            "uniqueItems": true,
            "items": {
              "type": "string",
              "minLength": 1,
              "maxLength": 200
            }
          },
          "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 200
          }
        },
        "required": [
          "target",
          "route",
          "role"
        ],
        "allOf": [
          {
            "if": {
              "properties": {
                "role": {
                  "const": "trainee"
                }
              },
              "required": [
                "role"
              ]
            },
            "then": {
              "required": [
                "name"
              ],
              "properties": {
                "name": {
                  "type": "string"
                }
              }
            },
            "else": {
              "required": [
                "operators"
              ],
              "properties": {
                "operators": {
                  "type": "array"
                }
              }
            }
          }
        ]
      },
      "prepared": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "target": {
            "$ref": "#/$defs/AtomicRoomTargetInput"
          },
          "route": {
            "enum": [
              "overview",
              "room"
            ]
          },
          "role": {
            "enum": [
              "normal",
              "trainee",
              "assistant"
            ]
          },
          "before": {
            "type": "object",
            "additionalProperties": true
          },
          "selected": {
            "type": "object",
            "additionalProperties": true
          },
          "selectionAttempt": {
            "type": "object",
            "additionalProperties": true
          }
        },
        "required": [
          "target",
          "route",
          "role",
          "selected"
        ]
      },
      "before": {
        "type": "object",
        "additionalProperties": true
      }
    },
    "required": [
      "request",
      "prepared"
    ]
  },
  "game.infrast.open_room": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "facility",
      "room"
    ],
    "properties": {
      "facility": {
        "enum": [
          "Mfg",
          "Trade",
          "Power",
          "Control",
          "Reception",
          "Office",
          "Dorm",
          "Processing",
          "Training",
          "Recycle"
        ]
      },
      "room": {
        "type": "integer",
        "minimum": 1,
        "maximum": 9
      },
      "position": {
        "type": "string",
        "minLength": 1,
        "maxLength": 32
      },
      "route": {
        "enum": [
          "overview",
          "room"
        ]
      }
    }
  },
  "game.infrast.open_roster": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "target": {
        "$ref": "#/$defs/AtomicRoomTargetInput"
      },
      "role": {
        "enum": [
          "trainee",
          "assistant"
        ]
      }
    },
    "required": [
      "target"
    ]
  },
  "game.infrast.read_roster": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "maxCapacity": {
        "type": "integer",
        "minimum": 1,
        "maximum": 5
      }
    },
    "required": []
  },
  "game.infrast.rotate_queue": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.infrast.enter_trim": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.infrast.trim": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "observation.trim": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.mall.open_credit_store": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.inventory.select_materials": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "workflow.inventory.read_depot": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "workflow.inventory.read_operators": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.infrast.reset_filter": {
    "type": "object",
    "additionalProperties": false,
    "properties": {}
  },
  "game.infrast.page_roster": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "direction": {
        "enum": [
          "left",
          "right"
        ]
      }
    },
    "required": [
      "direction"
    ]
  },
  "game.infrast.select_operator": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "name": {
        "type": "string",
        "minLength": 1,
        "maxLength": 100
      },
      "selected": {
        "type": "boolean"
      }
    },
    "required": [
      "name"
    ]
  },
  "game.infrast.clear_roster": {
    "type": "object",
    "additionalProperties": false,
    "properties": {}
  },
  "operation.start_app": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "appId"
    ],
    "properties": {
      "appId": {
        "type": "string",
        "minLength": 3,
        "maxLength": 200,
        "pattern": "^[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)+$"
      },
      "intent": {
        "type": "string",
        "minLength": 5,
        "maxLength": 400,
        "pattern": "^[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)+/(?:\\.[A-Za-z_$][A-Za-z0-9_.$]*|[A-Za-z_$][A-Za-z0-9_$]*(?:\\.[A-Za-z_$][A-Za-z0-9_$]*)+)$",
        "description": "Explicit Android component in the same appId; native validates package equality. No shell or am flags."
      }
    }
  },
  "operation.stop_app": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "appId"
    ],
    "properties": {
      "appId": {
        "type": "string",
        "minLength": 3,
        "maxLength": 200,
        "pattern": "^[A-Za-z][A-Za-z0-9_]*(?:\\.[A-Za-z][A-Za-z0-9_]*)+$"
      }
    }
  },
  "game.startup.launch": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "clientType": {
        "enum": [
          "Official",
          "Bilibili"
        ]
      },
      "startGame": {
        "type": "boolean"
      }
    },
    "required": [
      "clientType",
      "startGame"
    ]
  },
  "game.startup.close": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "clientType": {
        "enum": [
          "Official",
          "Bilibili"
        ]
      }
    },
    "required": [
      "clientType"
    ]
  },
  "workflow.startup.start": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "clientType": {
        "enum": [
          "Official",
          "Bilibili"
        ]
      },
      "startGame": {
        "type": "boolean"
      }
    },
    "required": [
      "clientType",
      "startGame"
    ]
  },
  "workflow.startup.close": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "clientType": {
        "enum": [
          "Official",
          "Bilibili"
        ]
      }
    },
    "required": [
      "clientType"
    ]
  },
  "game.award.mail_enter": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.award.mail_claim": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.award.mail_close": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "workflow.award.mail": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.startup.return_home": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.fight.open_terminal": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.fight.open_episode": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "stage": {
        "type": "string",
        "minLength": 1,
        "maxLength": 80
      }
    },
    "required": [
      "stage"
    ]
  },
  "game.fight.select_stage": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "stage": {
        "type": "string",
        "minLength": 1,
        "maxLength": 80
      }
    },
    "required": [
      "stage"
    ]
  },
  "workflow.fight.navigate": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "stage": {
        "type": "string",
        "minLength": 1,
        "maxLength": 80
      }
    },
    "required": [
      "stage"
    ]
  },
  "game.fight.replenish": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "medicine": {
        "type": "integer",
        "minimum": 0,
        "maximum": 2147483647
      },
      "stone": {
        "type": "integer",
        "minimum": 0,
        "maximum": 2147483647
      }
    },
    "required": []
  },
  "workflow.fight.single_battle": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "medicine": {
        "type": "integer",
        "minimum": 0,
        "maximum": 2147483647
      },
      "stone": {
        "type": "integer",
        "minimum": 0,
        "maximum": 2147483647
      },
      "series": {
        "type": "integer",
        "minimum": 1,
        "maximum": 6
      },
      "drops": {
        "type": "object",
        "minProperties": 0,
        "maxProperties": 100,
        "propertyNames": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128,
          "pattern": "^[A-Za-z0-9_-]+$"
        },
        "additionalProperties": {
          "type": "integer",
          "minimum": 1,
          "maximum": 2147483647
        }
      }
    },
    "required": []
  },
  "game.infrast.resolve_rooms": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "rooms"
    ],
    "properties": {
      "rooms": {
        "type": "array",
        "minItems": 1,
        "maxItems": 32,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "facility",
            "room"
          ],
          "properties": {
            "facility": {
              "enum": [
                "Mfg",
                "Trade",
                "Power",
                "Control",
                "Reception",
                "Office",
                "Dorm",
                "Processing",
                "Training",
                "Recycle"
              ]
            },
            "room": {
              "type": "integer",
              "minimum": 1,
              "maximum": 9
            },
            "position": {
              "type": "string",
              "minLength": 1,
              "maxLength": 32
            },
            "operators": {
              "type": "array",
              "maxItems": 5,
              "uniqueItems": true,
              "items": {
                "type": "string",
                "minLength": 1,
                "maxLength": 100
              }
            },
            "trainee": {
              "type": "string",
              "minLength": 1,
              "maxLength": 100
            },
            "assistant": {
              "type": "string",
              "minLength": 1,
              "maxLength": 100
            }
          }
        }
      }
    }
  },
  "workflow.infrast.custom_shift": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "plan"
    ],
    "properties": {
      "plan": {
        "type": "object"
      },
      "planIndex": {
        "type": "integer",
        "minimum": 0,
        "maximum": 9999
      },
      "sourceSha256": {
        "type": "string",
        "pattern": "^[a-f0-9]{64}$"
      },
      "facilities": {
        "type": "array",
        "minItems": 1,
        "maxItems": 10,
        "uniqueItems": true,
        "items": {
          "enum": [
            "Mfg",
            "Trade",
            "Power",
            "Control",
            "Reception",
            "Office",
            "Dorm",
            "Processing",
            "Training",
            "Recycle"
          ]
        }
      },
      "threshold": {
        "type": "number",
        "minimum": 0,
        "maximum": 1
      }
    }
  },
  "game.recruit.read_slots": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.recruit.refresh": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.recruit.leave": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.recruit.dismiss_result": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.recruit.open_slot": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "slot"
    ],
    "properties": {
      "slot": {
        "type": "integer",
        "minimum": 0,
        "maximum": 3
      }
    }
  },
  "game.recruit.read_plan": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "select": {
        "type": "array",
        "maxItems": 6,
        "items": {
          "type": "integer",
          "minimum": 1,
          "maximum": 6
        },
        "uniqueItems": true
      },
      "confirm": {
        "type": "array",
        "maxItems": 6,
        "items": {
          "type": "integer",
          "minimum": 1,
          "maximum": 6
        },
        "uniqueItems": true
      },
      "setTime": {
        "type": "boolean"
      },
      "recruitmentTime": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "3": {
            "type": "integer",
            "minimum": 60,
            "maximum": 540,
            "multipleOf": 10
          },
          "4": {
            "type": "integer",
            "minimum": 60,
            "maximum": 540,
            "multipleOf": 10
          },
          "5": {
            "type": "integer",
            "minimum": 60,
            "maximum": 540,
            "multipleOf": 10
          },
          "6": {
            "type": "integer",
            "minimum": 60,
            "maximum": 540,
            "multipleOf": 10
          }
        }
      },
      "extraTagsMode": {
        "enum": [
          0,
          1,
          2
        ]
      },
      "preserveTags": {
        "type": "array",
        "maxItems": 50,
        "items": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        },
        "uniqueItems": true
      },
      "firstTags": {
        "type": "array",
        "maxItems": 50,
        "items": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        },
        "uniqueItems": true
      },
      "skipRobot": {
        "type": "boolean"
      }
    }
  },
  "game.recruit.prepare": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "select": {
        "type": "array",
        "maxItems": 6,
        "items": {
          "type": "integer",
          "minimum": 1,
          "maximum": 6
        },
        "uniqueItems": true
      },
      "confirm": {
        "type": "array",
        "maxItems": 6,
        "items": {
          "type": "integer",
          "minimum": 1,
          "maximum": 6
        },
        "uniqueItems": true
      },
      "setTime": {
        "type": "boolean"
      },
      "recruitmentTime": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "3": {
            "type": "integer",
            "minimum": 60,
            "maximum": 540,
            "multipleOf": 10
          },
          "4": {
            "type": "integer",
            "minimum": 60,
            "maximum": 540,
            "multipleOf": 10
          },
          "5": {
            "type": "integer",
            "minimum": 60,
            "maximum": 540,
            "multipleOf": 10
          },
          "6": {
            "type": "integer",
            "minimum": 60,
            "maximum": 540,
            "multipleOf": 10
          }
        }
      },
      "extraTagsMode": {
        "enum": [
          0,
          1,
          2
        ]
      },
      "preserveTags": {
        "type": "array",
        "maxItems": 50,
        "items": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        },
        "uniqueItems": true
      },
      "firstTags": {
        "type": "array",
        "maxItems": 50,
        "items": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        },
        "uniqueItems": true
      },
      "skipRobot": {
        "type": "boolean"
      }
    }
  },
  "game.recruit.confirm": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "maxPermits": {
        "type": "integer",
        "minimum": 0,
        "maximum": 2147483647
      },
      "reservePermits": {
        "type": "integer",
        "minimum": 0,
        "maximum": 2147483647
      }
    }
  },
  "workflow.recruit.daily": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "select": {
        "type": "array",
        "maxItems": 6,
        "items": {
          "type": "integer",
          "minimum": 1,
          "maximum": 6
        },
        "uniqueItems": true
      },
      "confirm": {
        "type": "array",
        "maxItems": 6,
        "items": {
          "type": "integer",
          "minimum": 1,
          "maximum": 6
        },
        "uniqueItems": true
      },
      "setTime": {
        "type": "boolean"
      },
      "recruitmentTime": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "3": {
            "type": "integer",
            "minimum": 60,
            "maximum": 540,
            "multipleOf": 10
          },
          "4": {
            "type": "integer",
            "minimum": 60,
            "maximum": 540,
            "multipleOf": 10
          },
          "5": {
            "type": "integer",
            "minimum": 60,
            "maximum": 540,
            "multipleOf": 10
          },
          "6": {
            "type": "integer",
            "minimum": 60,
            "maximum": 540,
            "multipleOf": 10
          }
        }
      },
      "extraTagsMode": {
        "enum": [
          0,
          1,
          2
        ]
      },
      "preserveTags": {
        "type": "array",
        "maxItems": 50,
        "items": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        },
        "uniqueItems": true
      },
      "firstTags": {
        "type": "array",
        "maxItems": 50,
        "items": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        },
        "uniqueItems": true
      },
      "skipRobot": {
        "type": "boolean"
      },
      "times": {
        "type": "integer",
        "minimum": 0,
        "maximum": 4
      },
      "maxPermits": {
        "type": "integer",
        "minimum": 0,
        "maximum": 2147483647
      },
      "refresh": {
        "type": "boolean"
      },
      "forceRefresh": {
        "type": "boolean"
      },
      "reservePermits": {
        "type": "integer",
        "minimum": 0,
        "maximum": 2147483647
      }
    }
  },
  "game.fight.set_series": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "series"
    ],
    "properties": {
      "series": {
        "type": "integer",
        "minimum": 1,
        "maximum": 6
      }
    }
  },
  "game.fight.read_drops": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "itemIds"
    ],
    "properties": {
      "itemIds": {
        "type": "array",
        "minItems": 1,
        "maxItems": 100,
        "uniqueItems": true,
        "items": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128,
          "pattern": "^[A-Za-z0-9_-]+$"
        }
      }
    }
  },
  "workflow.fight.legacy_batch": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "times"
    ],
    "properties": {
      "medicine": {
        "type": "integer",
        "minimum": 0,
        "maximum": 2147483647
      },
      "stone": {
        "type": "integer",
        "minimum": 0,
        "maximum": 2147483647
      },
      "series": {
        "type": "integer",
        "minimum": 1,
        "maximum": 6
      },
      "drops": {
        "type": "object",
        "minProperties": 0,
        "maxProperties": 100,
        "propertyNames": {
          "type": "string",
          "minLength": 1,
          "maxLength": 128,
          "pattern": "^[A-Za-z0-9_-]+$"
        },
        "additionalProperties": {
          "type": "integer",
          "minimum": 1,
          "maximum": 2147483647
        }
      },
      "times": {
        "type": "integer",
        "minimum": 1,
        "maximum": 2147483647
      }
    }
  },
  "game.mall.choose_product": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {
      "buyFirst": {
        "type": "array",
        "maxItems": 100,
        "items": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        }
      },
      "blacklist": {
        "type": "array",
        "maxItems": 100,
        "items": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        }
      },
      "onlyDiscount": {
        "type": "boolean"
      },
      "reserveMaxCredit": {
        "type": "boolean"
      },
      "phase": {
        "enum": [
          "priority",
          "general",
          "overflow"
        ]
      }
    }
  },
  "game.mall.open_product": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.mall.close_reward": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.mall.enter_friends": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.mall.open_friend_list": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.mall.visit_first": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.mall.visit_next": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.mall.read_visit": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {}
  },
  "game.mall.purchase_selected": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {
      "maxCredit": {
        "type": "integer",
        "minimum": 0,
        "maximum": 2147483647
      }
    }
  },
  "workflow.mall.shopping": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {
      "buyFirst": {
        "type": "array",
        "maxItems": 100,
        "items": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        }
      },
      "blacklist": {
        "type": "array",
        "maxItems": 100,
        "items": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        }
      },
      "onlyDiscount": {
        "type": "boolean"
      },
      "reserveMaxCredit": {
        "type": "boolean"
      },
      "forceShoppingIfCreditFull": {
        "type": "boolean"
      },
      "maxCredit": {
        "type": "integer",
        "minimum": 0,
        "maximum": 2147483647
      }
    }
  },
  "workflow.mall.visit_friends": {
    "type": "object",
    "additionalProperties": false,
    "required": [],
    "properties": {
      "oncePerDay": {
        "type": "boolean"
      }
    }
  },
  "game.infrast.prepare_auto_roster": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "target"
    ],
    "properties": {
      "target": {
        "$ref": "#/$defs/AtomicRoomTargetInput"
      },
      "route": {
        "enum": [
          "room",
          "overview"
        ]
      },
      "threshold": {
        "type": "number",
        "minimum": 0,
        "maximum": 1
      },
      "excludedNames": {
        "type": "array",
        "maxItems": 500,
        "uniqueItems": true,
        "items": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        }
      },
      "requiredNames": {
        "type": "array",
        "maxItems": 5,
        "uniqueItems": true,
        "items": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        }
      }
    }
  },
  "workflow.infrast.auto_room_shift": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "target"
    ],
    "properties": {
      "target": {
        "$ref": "#/$defs/AtomicRoomTargetInput"
      },
      "route": {
        "enum": [
          "room",
          "overview"
        ]
      },
      "threshold": {
        "type": "number",
        "minimum": 0,
        "maximum": 1
      },
      "excludedNames": {
        "type": "array",
        "maxItems": 500,
        "uniqueItems": true,
        "items": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        }
      },
      "requiredNames": {
        "type": "array",
        "maxItems": 5,
        "uniqueItems": true,
        "items": {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        }
      }
    }
  },
  "game.infrast.enumerate_rooms": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "facilities"
    ],
    "properties": {
      "facilities": {
        "type": "array",
        "minItems": 1,
        "maxItems": 7,
        "uniqueItems": true,
        "items": {
          "enum": [
            "Mfg",
            "Trade",
            "Power",
            "Control",
            "Reception",
            "Office",
            "Dorm"
          ]
        }
      }
    }
  },
  "workflow.infrast.daily": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "facilities": {
        "type": "array",
        "minItems": 1,
        "maxItems": 7,
        "uniqueItems": true,
        "items": {
          "enum": [
            "Mfg",
            "Trade",
            "Power",
            "Control",
            "Reception",
            "Office",
            "Dorm"
          ]
        }
      },
      "threshold": {
        "type": "number",
        "minimum": 0,
        "maximum": 1
      }
    }
  }
};
export const atomicCapabilityResultSchema: Record<string, unknown> = {
  "type": "object",
  "additionalProperties": false,
  "required": [
    "status",
    "data",
    "verified"
  ],
  "properties": {
    "status": {
      "enum": [
        "completed",
        "partial",
        "failed",
        "unavailable",
        "cancelled",
        "unknown"
      ]
    },
    "data": {},
    "verified": {
      "type": "boolean"
    },
    "nativeSuccess": {
      "type": "boolean"
    },
    "message": {
      "type": "string",
      "maxLength": 4096
    }
  }
};
export const atomicPrimitiveDataSchemas: Record<string, Record<string, unknown>> = {
  "frame": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "frameId": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "width": {
        "type": "integer",
        "minimum": 1,
        "maximum": 8192
      },
      "height": {
        "type": "integer",
        "minimum": 1,
        "maximum": 8192
      },
      "data": {
        "type": "string",
        "minLength": 1,
        "maxLength": 4183384
      },
      "capturedAt": {
        "type": "string",
        "minLength": 1,
        "maxLength": 40
      },
      "deviceId": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "mimeType": {
        "const": "image/png"
      },
      "canControl": {
        "type": "boolean"
      },
      "latencyMs": {
        "description": "Application-service duration of the native frame request, including image retrieval and transport.",
        "type": "number",
        "minimum": 0
      },
      "engine": {
        "const": "maafw"
      },
      "sessionId": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "resourceGeneration": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "coordinateSpace": {
        "const": "frame"
      },
      "fresh": {
        "type": "boolean"
      }
    },
    "required": [
      "frameId",
      "width",
      "height",
      "data"
    ]
  },
  "recognize": {
    "type": "object",
    "additionalProperties": false,
    "required": [
      "hit",
      "matches"
    ],
    "properties": {
      "hit": {
        "type": "boolean"
      },
      "matches": {
        "type": "array",
        "maxItems": 256,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "box",
            "score"
          ],
          "properties": {
            "box": {
              "type": "array",
              "minItems": 4,
              "maxItems": 4,
              "items": [
                {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 8192
                },
                {
                  "type": "number",
                  "minimum": 0,
                  "maximum": 8192
                },
                {
                  "type": "number",
                  "exclusiveMinimum": 0,
                  "maximum": 8192
                },
                {
                  "type": "number",
                  "exclusiveMinimum": 0,
                  "maximum": 8192
                }
              ],
              "additionalItems": false
            },
            "score": {
              "type": "number"
            },
            "text": {
              "type": "string"
            },
            "count": {
              "type": "number",
              "minimum": 0
            }
          }
        }
      },
      "coordinateSize": {
        "type": "array",
        "minItems": 2,
        "maxItems": 2,
        "items": {
          "type": "integer",
          "minimum": 1,
          "maximum": 8192
        }
      },
      "frameId": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "engine": {
        "const": "maafw"
      },
      "resourceGeneration": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "fresh": {
        "type": "boolean"
      }
    }
  },
  "input": {
    "type": "object",
    "required": [
      "accepted"
    ],
    "properties": {
      "accepted": {
        "type": "boolean"
      },
      "nativeSuccess": {
        "type": "boolean"
      }
    },
    "additionalProperties": false
  }
};
