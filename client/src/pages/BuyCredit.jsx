import React from "react";
import { assets, plans } from "../assets/assets";
import { motion } from "framer-motion";
import { useContext } from "react";
import { AppContext } from "../context/AppContext";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "react-toastify";

const BuyCredit = () => {
  const { user, backendUrl, loadCreditsData, token, setShowLogin } =
    useContext(AppContext);

  const navigate = useNavigate();

  const initpay = async (order) => {
    console.log("Initializing Razorpay with order:", order);

    const options = {
      key: import.meta.env.VITE_RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency,
      name: "Credits Payment",
      description: "Credits Payment",
      order_id: order.id,
      receipt: order.receipt,
      handler: async (response) => {
        console.log("Razorpay payment successful, response:", response);
        try {
          const { data } = await axios.post(
            backendUrl + "/api/user/verify-razor",
            {
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
            },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          console.log("Verification response:", data);
          if (data.success) {
            loadCreditsData();
            navigate("/");
            toast.success("Credits added successfully!");
          } else {
            toast.error(data.message || "Payment verification failed.");
          }
        } catch (error) {
          console.error("Error verifying payment:", error);
          toast.error(error.response?.data?.message || error.message);
        }
      },
      theme: { color: "#6366F1" },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
  };

  const paymentRazorpay = async (planId) => {
    try {
      console.log("Purchase clicked, planId:", planId);
      if (!user) {
        console.log("User not logged in, showing login modal.");
        setShowLogin(true);
        return;
      }

      console.log(
        "Sending request to backend:",
        backendUrl + "/api/user/pay-razor"
      );

      const { data } = await axios.post(
        backendUrl + "/api/user/pay-razor",
        { planId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log("Received data from /pay-razor:", data);
      console.log("Success:", data.success);
      console.log("Order:", data.order);

      if (data.success) {
        initpay(data.order);
      } else {
        toast.error(data.message || "Failed to create Razorpay order.");
      }
    } catch (error) {
      console.error("Error in paymentRazorpay:", error);
      toast.error(error.response?.data?.message || error.message);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0.2, y: 100 }}
      transition={{ duration: 1 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="min-h-[80vh] text-center pt-14 mb-10"
    >
      <button className="border border-gray-400 px-10 py-2 rounded-full mb-6">
        Our Subscription
      </button>
      <h1 className="text-center text-3xl font-bold mb-6 sm:mb-10">
        Choose the Subscription
      </h1>
      <div className="flex flex-wrap justify-center gap-6 text-left">
        {plans.map((item, index) => (
          <div
            key={index}
            className="bg-pink-50 drop-shadow-sm border rounded-lg py-12 px-8 text-gray-600 hover:scale-105 transition-all
         duration-500 cursor-pointer"
          >
            <img src={assets.logo_icon} alt="" width={40} />
            <p className="mt-3 mb-1 font-semibold">{item.id}</p>
            <p className="text-sm">{item.desc}</p>
            <p className="mt-6">
              <span className="text-3xl">₹{item.price}</span> / {item.credits}{" "}
              credits
            </p>
            <button
              onClick={() => paymentRazorpay(item.id)}
              className="w-full bg-blue-600 text-white mt-8 text-sm rounded-full py-2.5 min-w-52 cursor-pointer"
            >
              {user ? "Purchase" : "Get Started"}
            </button>
          </div>
        ))}
      </div>
    </motion.div>
  );
};

export default BuyCredit;
