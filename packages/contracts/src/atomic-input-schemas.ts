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
        "items": [
          {
            "const": 1280
          },
          {
            "const": 720
          }
        ],
        "additionalItems": false
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
