import userModel from "../models/userModel.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import validator from "validator";
import Razorpay from "razorpay";
import transactionModel from "../models/transactionModel.js";
import crypto from "crypto";

const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.json({ success: false, message: "Missing Details" });
    }

    if (!validator.isEmail(email)) {
      return res.json({
        success: false,
        message: "Please enter a valid email",
      });
    }

    if (password.length < 8) {
      return res.json({
        success: false,
        message: "Password length should be atleast 8 characters!",
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const userData = {
      name,
      email,
      password: hashedPassword,
    };

    const newUser = new userModel(userData);
    const user = await newUser.save();
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

    res.json({ success: true, token, user: { name: user.name } });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await userModel.findOne({ email });

    if (!user) {
      return res.json({ success: false, message: "User does not exist" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (isMatch) {
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
      res.json({ success: true, token });
    } else {
      res.json({ success: false, message: "Invalid credentials" });
    }
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

const userCredits = async (req, res) => {
  try {
    const userId = req.userId;

    const user = await userModel.findById(userId);
    res.json({
      success: true,
      credits: user.creditBalance,
      user: { name: user.name },
    });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const paymentRazorpay = async (req, res) => {
  try {
    const userId = req.userId;
    const { planId } = req.body;

    const userData = await userModel.findById(userId);

    if (!userData || !planId) {
      return res.json({ success: false, message: "Missing Details" });
    }

    let credits, plan, amount;

    switch (planId) {
      case "Basic":
        plan = "Basic";
        credits = 10;
        amount = 20;
        break;
      case "Advanced":
        plan = "Advanced";
        credits = 30;
        amount = 50;
        break;
      case "Premium":
        plan = "Premium";
        credits = 70;
        amount = 100;
        break;
      default:
        return res.json({ success: false, message: "Plan not found" });
    }

    const options = {
      amount: amount * 100,
      currency: process.env.CURRENCY || "INR",
      receipt: new mongoose.Types.ObjectId().toString(), // temporary ID
    };

    // 1. Create Razorpay Order first
    razorpayInstance.orders.create(options, async (error, order) => {
      if (error) {
        console.log("Razorpay Order Error:", error);
        return res.json({ success: false, message: error });
      }

      // 2. Now create transaction with razorpayOrderId
      const transactionData = {
        userId,
        plan,
        amount,
        credits,
        date: Date.now(),
        razorpayOrderId: order.id,
      };

      await transactionModel.create(transactionData);

      console.log("Razorpay Order:", order);

      return res.json({ success: true, order });
    });
  } catch (error) {
    console.log("Server Error:", error);
    res.json({ success: false, message: error.message });
  }
};

// API to verify payment of razorpay
const verifyRazorpay = async (req, res) => {
  try {
    const { razorpay_order_id } = req.body;

    if (!razorpay_order_id) {
      return res.json({ success: false, message: "Missing Razorpay Order ID" });
    }

    // 1. Fetch Razorpay order info
    const orderInfo = await razorpayInstance.orders.fetch(razorpay_order_id);

    if (!orderInfo || !orderInfo.id) {
      return res.json({ success: false, message: "Invalid Razorpay order" });
    }

    // 2. Fetch transaction using razorpayOrderId
    const transactionData = await transactionModel.findOne({
      razorpayOrderId: orderInfo.id,
    });

    if (!transactionData) {
      return res.json({ success: false, message: "Transaction not found" });
    }

    if (transactionData.payment) {
      return res.json({ success: false, message: "Payment already processed" });
    }

    // 3. Verify payment status
    if (orderInfo.status === "paid") {
      const userData = await userModel.findById(transactionData.userId);

      if (!userData) {
        return res.json({ success: false, message: "User not found" });
      }

      const updatedCredits = userData.creditBalance + transactionData.credits;

      // 4. Update user credits and transaction payment status
      await userModel.findByIdAndUpdate(userData._id, {
        creditBalance: updatedCredits,
      });
      await transactionModel.findByIdAndUpdate(transactionData._id, {
        payment: true,
      });

      return res.json({ success: true, message: "Credits added successfully" });
    } else {
      return res.json({ success: false, message: "Payment not completed yet" });
    }
  } catch (error) {
    console.error("Razorpay Verification Error:", error);
    return res.json({ success: false, message: error.message });
  }
};

export {
  registerUser,
  loginUser,
  userCredits,
  paymentRazorpay,
  verifyRazorpay,
};
