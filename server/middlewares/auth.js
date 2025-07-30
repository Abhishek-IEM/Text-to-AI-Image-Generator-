import jwt from "jsonwebtoken";

const authUser = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Not Authorized. Login Again.",
      });
    }

    const token = authHeader.split(" ")[1];

    // Verify and decode the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.id) {
      return res.status(401).json({
        success: false,
        message: "Not Authorized. Login Again.",
      });
    }

    // Attach userId to the request for controllers to use
    req.userId = decoded.id;

    next();
  } catch (error) {
    console.error(error);
    res.status(401).json({
      success: false,
      message: "Not Authorized. Login Again.",
    });
  }
};

export default authUser;
