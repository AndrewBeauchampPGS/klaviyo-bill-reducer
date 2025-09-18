#!/bin/bash

API_KEY="pk_913e4ee39fe8f2bc04ba2cb71294262d9e"

# Calculate 90 days ago
DATE_90_DAYS_AGO=$(date -u -v-90d +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || date -u -d '90 days ago' +%Y-%m-%dT%H:%M:%S.000Z)

# Use a date from 10 years ago for "all time" purchases
DATE_ALL_TIME="2015-01-01T00:00:00.000Z"

# Test creating a segment for profiles that can receive email marketing
if [ "$1" = "total" ]; then
  curl -X POST https://a.klaviyo.com/api/segments/ \
    -H "Authorization: Klaviyo-API-Key $API_KEY" \
    -H "revision: 2024-10-15" \
    -H "Content-Type: application/json" \
    -d '{
      "data": {
        "type": "segment",
        "attributes": {
          "name": "Test_CanReceiveEmail_'$(date +%s)'",
          "definition": {
            "condition_groups": [
              {
                "conditions": [
                  {
                    "type": "profile-marketing-consent",
                    "consent": {
                      "channel": "email",
                      "can_receive_marketing": true,
                      "consent_status": {
                        "subscription": "any"
                      }
                    }
                  }
                ]
              }
            ]
          }
        }
      }
    }' | python3 -m json.tool
  exit 0
fi

# Test combined segment with marketing consent + all other filters
if [ "$1" = "combined" ]; then
  curl -X POST https://a.klaviyo.com/api/segments/ \
    -H "Authorization: Klaviyo-API-Key $API_KEY" \
    -H "revision: 2024-10-15" \
    -H "Content-Type: application/json" \
    -d '{
      "data": {
        "type": "segment",
        "attributes": {
          "name": "Test_Combined_'$(date +%s)'",
          "definition": {
            "condition_groups": [
              {
                "conditions": [
                  {
                    "type": "profile-marketing-consent",
                    "consent": {
                      "channel": "email",
                      "can_receive_marketing": true,
                      "consent_status": {
                        "subscription": "any"
                      }
                    }
                  }
                ]
              },
              {
                "conditions": [
                  {
                    "type": "profile-metric",
                    "metric_id": "TbrcPw",
                    "measurement": "count",
                    "measurement_filter": {
                      "type": "numeric",
                      "operator": "equals",
                      "value": 0
                    },
                    "timeframe_filter": {
                      "type": "date",
                      "operator": "after",
                      "date": "'"$DATE_90_DAYS_AGO"'"
                    }
                  }
                ]
              },
              {
                "conditions": [
                  {
                    "type": "profile-metric",
                    "metric_id": "UXR6jZ",
                    "measurement": "count",
                    "measurement_filter": {
                      "type": "numeric",
                      "operator": "equals",
                      "value": 0
                    },
                    "timeframe_filter": {
                      "type": "date",
                      "operator": "after",
                      "date": "'"$DATE_90_DAYS_AGO"'"
                    }
                  }
                ]
              },
              {
                "conditions": [
                  {
                    "type": "profile-metric",
                    "metric_id": "XbDbnZ",
                    "measurement": "count",
                    "measurement_filter": {
                      "type": "numeric",
                      "operator": "equals",
                      "value": 0
                    },
                    "timeframe_filter": {
                      "type": "date",
                      "operator": "after",
                      "date": "'"$DATE_ALL_TIME"'"
                    }
                  }
                ]
              },
              {
                "conditions": [
                  {
                    "type": "profile-metric",
                    "metric_id": "Xpi2t7",
                    "measurement": "count",
                    "measurement_filter": {
                      "type": "numeric",
                      "operator": "greater-than-or-equal",
                      "value": 5
                    },
                    "timeframe_filter": {
                      "type": "date",
                      "operator": "after",
                      "date": "'"$DATE_90_DAYS_AGO"'"
                    }
                  }
                ]
              }
            ]
          }
        }
      }
    }' | python3 -m json.tool
  exit 0
fi

# Test adding "received at least X emails" condition to ensure they've been on list for a while
curl -X POST https://a.klaviyo.com/api/segments/ \
  -H "Authorization: Klaviyo-API-Key $API_KEY" \
  -H "revision: 2024-10-15" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "type": "segment",
      "attributes": {
        "name": "Test_WithBounces_'$(date +%s)'",
        "definition": {
          "condition_groups": [
            {
              "conditions": [
                {
                  "type": "profile-metric",
                  "metric_id": "TbrcPw",
                  "measurement": "count",
                  "measurement_filter": {
                    "type": "numeric",
                    "operator": "equals",
                    "value": 0
                  },
                  "timeframe_filter": {
                    "type": "date",
                    "operator": "after",
                    "date": "'$DATE_90_DAYS_AGO'"
                  }
                }
              ]
            },
            {
              "conditions": [
                {
                  "type": "profile-metric",
                  "metric_id": "UXR6jZ",
                  "measurement": "count",
                  "measurement_filter": {
                    "type": "numeric",
                    "operator": "equals",
                    "value": 0
                  },
                  "timeframe_filter": {
                    "type": "date",
                    "operator": "after",
                    "date": "'$DATE_90_DAYS_AGO'"
                  }
                }
              ]
            },
            {
              "conditions": [
                {
                  "type": "profile-metric",
                  "metric_id": "XbDbnZ",
                  "measurement": "count",
                  "measurement_filter": {
                    "type": "numeric",
                    "operator": "equals",
                    "value": 0
                  },
                  "timeframe_filter": {
                    "type": "date",
                    "operator": "after",
                    "date": "'$DATE_ALL_TIME'"
                  }
                }
              ]
            },
            {
              "conditions": [
                {
                  "type": "profile-metric",
                  "metric_id": "Xpi2t7",
                  "measurement": "count",
                  "measurement_filter": {
                    "type": "numeric",
                    "operator": "greater-than-or-equal",
                    "value": 5
                  },
                  "timeframe_filter": {
                    "type": "date",
                    "operator": "after",
                    "date": "'$DATE_90_DAYS_AGO'"
                  }
                }
              ]
            }
          ]
        }
      }
    }
  }' | python3 -m json.tool