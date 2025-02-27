require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ad8zj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function connectDB() {
  try {
    await client.connect();
    console.log("Connected to MongoDB!");
  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
}

connectDB();

const taskCollection = client.db("taskDB").collection("tasks");
const userCollection = client.db("taskDB").collection("users");

app.post("/users", async (req, res) => {
  const user = req.body;
  const query = { email: user.email };
  const existingUser = await userCollection.findOne(query);
  if (existingUser) {
    return res.send({ message: "user already exists", insertedId: null });
  }
  const result = await userCollection.insertOne(user);
  res.send(result);
});

app.get("/users", async (req, res) => {
  const email = req.query.email;
  if (!email) {
    return res.status(400).send({ message: "Email is Needed" });
  }
  const filter = { email };
  const result = await userCollection.find(filter).toArray();
  res.send(result);
});

app.get("/tasks", async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const tasks = await taskCollection.find({ email }).toArray();
    res.json(tasks);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/tasks", async (req, res) => {
  try {
    const data = req.body;
    if (!data.email || !data.title) {
      return res.status(400).json({ error: "Email and title are required" });
    }

    data.order = Date.now();
    const result = await taskCollection.insertOne(data);
    res.status(201).json(result);
  } catch (error) {
    console.error("Error adding task:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.patch("/tasks/:id", async (req, res) => {
  try {
    const { title, description, category, type } = req.body;
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid task ID" });
    }

    const task = await taskCollection.findOne({ _id: new ObjectId(id) });
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    const result = await taskCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { title, description, category, type } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ error: "Task update failed" });
    }

    res.json({ message: "Task updated successfully" });
  } catch (error) {
    console.error("Error updating task:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/tasks/:id", async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid task ID" });
    }

    const query = { _id: new ObjectId(id) };
    const result = await taskCollection.deleteOne(query);

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json({ message: "Task deleted successfully" });
  } catch (error) {
    console.error("Error deleting task:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.patch("/tasks/update-status", async (req, res) => {
  try {
    const currentDate = new Date();
    const result = await taskCollection.updateMany(
      { deadline: { $lt: currentDate }, type: "active" },
      { $set: { type: "timeout" } }
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to update tasks" });
  }
});

cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();
    const expiredTasks = await taskCollection
      .find({
        deadline: { $lt: now },
        type: "active",
      })
      .toArray();

    if (expiredTasks.length > 0) {
      await taskCollection.updateMany(
        { _id: { $in: expiredTasks.map((task) => task._id) } },
        { $set: { type: "timeout" } }
      );
      console.log(`${expiredTasks.length} tasks moved to timeout.`);
    }
  } catch (error) {
    console.error("Error updating expired tasks:", error);
  }
});

app.get("/", (req, res) => {
  res.send("Task Manager API is running!");
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
