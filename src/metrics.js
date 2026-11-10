const config = require("./config");
const os = require("os");

// Metrics stored in memory
const requests = {};
let pizzaPurchasedCount = 0;
let totalRevenue = 0;
let lastUserActivity = {};
let requestCount = 0;
let latencySum = 0;
let pizzaRequestCount = 0;
let pizzaLatencySum = 0;
let successfulAuthAttempts = 0;
let failedAuthAttempts = 0;
const userActivityTimeout = 5 * 60 * 1000; // 5 minutes

function pizzaPurchased(order) {
  order.items.forEach((item) => {
    pizzaPurchasedCount++;
    totalRevenue += item.price;
  });
}

function trackPizzaCreationLatency(startTime) {
  const latency = Date.now() - startTime;
  pizzaRequestCount++;
  pizzaLatencySum += latency;
}

function getActiveUserCount() {
  for (const userId in lastUserActivity) {
    if (Date.now() - lastUserActivity[userId] > userActivityTimeout) {
      delete lastUserActivity[userId];
    }
  }
  return Object.keys(lastUserActivity).length;
}

function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return cpuUsage.toFixed(2) * 100;
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  return memoryUsage.toFixed(2);
}

// Middleware to track requests
function requestTracker(req, res, next) {
  const method = req.method;
  requests[method] = (requests[method] || 0) + 1;
  next();
}

// Middleware to track request latency
function trackRequestLatency(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    const latency = Date.now() - start;
    requestCount++;
    latencySum += latency;
  });
  next();
}

// Middleware to track user activity
function trackUserActivity(req, res, next) {
  const userId = req.user?.id;
  if (userId) {
    lastUserActivity[userId] = Date.now();
  }
  next();
}

// Middleware to track auth attempts
function trackAuthAttempts(req, res, next) {
  if (req.user?.id) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      successfulAuthAttempts++;
    } else {
      failedAuthAttempts++;
    }
  }
  next();
}

// Periodically send metrics to Grafana
setInterval(() => {
  const metrics = [];
  Object.keys(requests).forEach((method) => {
    metrics.push(
      createMetric("requests", requests[method], "1", "sum", "asInt", {
        method,
      }),
    );
  });

  const intervalCount = requestCount;
  const intervalSum = latencySum;
  requestCount = 0;
  latencySum = 0;

  metrics.push(
    createMetric(
      "averageLatency",
      intervalCount > 0 ? intervalSum / intervalCount : 0,
      "ms",
      "gauge",
      "asDouble",
      {},
    ),
  );

  const pizzaIntervalCount = pizzaRequestCount;
  const pizzaIntervalSum = pizzaLatencySum;
  pizzaRequestCount = 0;
  pizzaLatencySum = 0;

  metrics.push(
    createMetric(
      "averagePizzaCreationLatency",
      pizzaIntervalCount > 0 ? pizzaIntervalSum / pizzaIntervalCount : 0,
      "ms",
      "gauge",
      "asDouble",
      {},
    ),
  );

  metrics.push(
    createMetric("activeUsers", getActiveUserCount(), "1", "sum", "asInt", {}),
  );

  metrics.push(
    createMetric(
      "cpuUsage",
      getCpuUsagePercentage(),
      "percent",
      "gauge",
      "asDouble",
      {},
    ),
  );

  metrics.push(
    createMetric(
      "memoryUsage",
      getMemoryUsagePercentage(),
      "percent",
      "gauge",
      "asDouble",
      {},
    ),
  );

  metrics.push(
    createMetric(
      "pizzaPurchased",
      pizzaPurchasedCount,
      "1",
      "sum",
      "asInt",
      {},
    ),
  );

  metrics.push(
    createMetric(
      "totalRevenue",
      totalRevenue,
      "BTC",
      "sum",
      "asDouble",
      {},
    ),
  );

  metrics.push(
    createMetric(
      "successfulAuthAttempts",
      successfulAuthAttempts,
      "1",
      "sum",
      "asInt",
      {},
    ),
  );

  metrics.push(
    createMetric(
      "failedAuthAttempts",
      failedAuthAttempts,
      "1",
      "sum",
      "asInt",
      {},
    ),
  );

  sendMetricToGrafana(metrics);
}, 10000);

function createMetric(
  metricName,
  metricValue,
  metricUnit,
  metricType,
  valueType,
  attributes,
) {
  attributes = { ...attributes, source: config.metrics.source };

  const metric = {
    name: metricName,
    unit: metricUnit,
    [metricType]: {
      dataPoints: [
        {
          [valueType]: metricValue,
          timeUnixNano: Date.now() * 1000000,
          attributes: [],
        },
      ],
    },
  };

  Object.keys(attributes).forEach((key) => {
    metric[metricType].dataPoints[0].attributes.push({
      key: key,
      value: { stringValue: attributes[key] },
    });
  });

  if (metricType === "sum") {
    metric[metricType].aggregationTemporality =
      "AGGREGATION_TEMPORALITY_CUMULATIVE";
    metric[metricType].isMonotonic = true;
  }

  return metric;
}

function sendMetricToGrafana(metrics) {
  const body = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics,
          },
        ],
      },
    ],
  };

  fetch(`${config.metrics.endpointUrl}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${config.metrics.accountId}:${config.metrics.apiKey}`,
      "Content-Type": "application/json",
    },
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP status: ${response.status}`);
      }
    })
    .catch((error) => {
      console.error("Error pushing metrics:", error);
    });
}

module.exports = {
  requestTracker,
  pizzaPurchased,
  trackUserActivity,
  trackAuthAttempts,
  trackRequestLatency,
  trackPizzaCreationLatency,
};
