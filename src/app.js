import express from "express";
import cors from "cors"; // <- importar cors
import routes from "./routes/index.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const corsOptions = {
    origin: "*",
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
// =============================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use("/api", routes);

export default app;
